import ipaddress
import os
import re
import socket
import subprocess
from concurrent.futures import ThreadPoolExecutor

import psutil

DEFAULT_PORTS = {"pjlink": 4352, "shure": 2202, "rtsp": 554}
PROTOCOLS = {
    "pjlink": {"type": "PROJECTOR", "manufacturer": "Unknown", "model": "PJLink projector"},
    "shure": {"type": "MICROPHONE", "manufacturer": "Shure", "model": "Shure network receiver"},
    "rtsp": {"type": "CAMERA", "manufacturer": "Unknown", "model": "RTSP camera"},
}
NOT_AV = "Not a recognised AV device. Only configured AV protocol ports can be adopted."
SCAN_SECONDS = 8
ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
AUDIO_UUIDS = ("0000110b", "0000110a", "0000111e", "00001108")
AUDIO_NAME = re.compile(r"speaker|headphone|\bphones\b|headset|earphone|earbud|buds|pods|disco|boom|jbl|soundbar|sound ?bar", re.I)
HEADSET_NAME = re.compile(r"headphone|\bphones\b|headset|earphone|earbud|buds|pods|disco", re.I)


def _local_network():
    for name, addresses in psutil.net_if_addrs().items():
        if re.match(r"^(lo|docker|br-|veth|virbr)", name):
            continue
        for address in addresses:
            if address.family != socket.AF_INET or address.address.startswith("127."):
                continue
            try:
                interface = ipaddress.IPv4Interface(f"{address.address}/{address.netmask}")
            except (TypeError, ValueError):
                continue
            return address.address, address.address, interface.network
    return None


def _ping(ip):
    try:
        subprocess.run(["ping", "-c", "1", "-W", "1", ip], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=2)
        return True
    except (OSError, subprocess.SubprocessError):
        return False


def _arp_table():
    macs = {}
    try:
        with open("/proc/net/arp", encoding="utf-8") as arp_file:
            for line in arp_file.read().splitlines()[1:]:
                fields = line.split()
                if len(fields) >= 4 and fields[3] != "00:00:00:00:00:00":
                    macs[fields[0]] = fields[3]
    except OSError:
        pass
    return macs


def _port_open(ip, port):
    try:
        with socket.create_connection((ip, port), timeout=0.8):
            return True
    except OSError:
        return False


def _udp_query(ip, port, packet, timeout=1):
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.settimeout(timeout)
            sock.sendto(packet, (ip, port))
            return sock.recv(2048)
    except OSError:
        return None


def _read_dns_name(data, offset, depth=0):
    labels = []
    end = offset
    hops = 0
    while offset < len(data) and hops < 20 and depth < 8:
        size = data[offset]
        if size == 0:
            end = max(end, offset + 1)
            break
        if size & 0xC0 == 0xC0:
            if offset + 1 >= len(data):
                break
            pointer = ((size & 0x3F) << 8) | data[offset + 1]
            if end == offset:
                end = offset + 2
            pointed, _ = _read_dns_name(data, pointer, depth + 1)
            if pointed:
                labels.append(pointed)
            offset += 2
            break
        if offset + size + 1 > len(data):
            break
        labels.append(data[offset + 1:offset + 1 + size].decode("latin1", errors="replace"))
        offset += size + 1
        end = offset
        hops += 1
    return ".".join(label for label in labels if label), end


def _mdns_name(ip):
    labels = [*reversed(ip.split(".")), "in-addr", "arpa"]
    question = b"".join(bytes([len(label)]) + label.encode() for label in labels) + b"\0"
    response = _udp_query(ip, 5353, b"\0\0\0\0\0\1\0\0\0\0\0\0" + question + b"\0\x0c\x80\x01")
    if not response or len(response) < 12:
        return None
    answers = int.from_bytes(response[6:8], "big")
    offset = 12
    for _ in range(int.from_bytes(response[4:6], "big")):
        _, offset = _read_dns_name(response, offset)
        offset += 4
    for _ in range(answers):
        _, offset = _read_dns_name(response, offset)
        if offset + 10 > len(response):
            return None
        record_type = int.from_bytes(response[offset:offset + 2], "big")
        length = int.from_bytes(response[offset + 8:offset + 10], "big")
        offset += 10
        if record_type == 12:
            return _read_dns_name(response, offset)[0]
        offset += length
    return None


def _netbios_name(ip):
    query = bytes([0x12, 0x34, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0x20]) + b"CK" + b"A" * 30 + bytes([0, 0, 0x21, 0, 1])
    response = _udp_query(ip, 137, query)
    if not response or len(response) < 57:
        return None
    _, offset = _read_dns_name(response, 12)
    entries_offset = offset + 10
    if entries_offset >= len(response):
        return None
    for index in range(response[entries_offset]):
        entry = entries_offset + 1 + index * 18
        if entry + 18 > len(response):
            break
        suffix = response[entry + 15]
        flags = int.from_bytes(response[entry + 16:entry + 18], "big")
        if suffix == 0 and flags & 0x8000 == 0:
            return response[entry:entry + 15].decode("latin1", errors="replace").strip()
    return None


def _reverse_dns(ip):
    try:
        name = socket.gethostbyaddr(ip)[0]
        if name != ip and not name.endswith("arpa"):
            return name.split(".")[0]
    except OSError:
        pass
    return None


def _device_name(ip):
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(fn, ip) for fn in (_mdns_name, _netbios_name, _reverse_dns)]
        for future in futures:
            try:
                name = future.result(timeout=1.2)
            except Exception:
                continue
            if name and not re.match(r"^\d+\.\d+\.\d+\.\d+", name) and not name.endswith("arpa"):
                return name.split(".")[0]
    return None


def scan_network(ports=None):
    network_data = _local_network()
    if not network_data:
        return {"subnet": None, "hosts": []}
    self_ip, self_ip_again, subnet = network_data
    addresses = [str(address) for address in subnet.hosts()]
    with ThreadPoolExecutor(max_workers=64) as pool:
        alive = [ip for ip, is_alive in zip(addresses, pool.map(_ping, addresses)) if is_alive or ip == self_ip]
    macs = _arp_table()
    ports = ports or DEFAULT_PORTS

    def inspect(ip):
        mac = psutil.net_if_addrs() and None
        if ip == self_ip:
            for addresses_on_interface in psutil.net_if_addrs().values():
                for address in addresses_on_interface:
                    if address.family == socket.AF_INET and address.address == self_ip:
                        mac = address.address
                        break
                if mac:
                    break
        mac = macs.get(ip) or (mac if ip == self_ip else None)
        identifier = f"NET-{mac or ip}"
        params = {"mac": mac} if mac else {}
        base = {"identifier": identifier, "ipAddress": ip, "macAddress": mac, "params": params, "via": "lan"}
        if ip == self_ip:
            return {**base, "name": f"{socket.gethostname()} (this computer)", "type": "OTHER", "manufacturer": "-", "model": "ShowCheck server", "adoptable": False, "reason": "This is the computer running ShowCheck."}
        name = _device_name(ip) or "Unknown device"
        for key, port in ports.items():
            config = PROTOCOLS.get(key)
            if config and _port_open(ip, port):
                return {**base, "name": name, **config, "adoptable": True}
        return {**base, "name": name, "type": "OTHER", "manufacturer": "Unknown", "model": "", "adoptable": False, "reason": NOT_AV}

    with ThreadPoolExecutor(max_workers=16) as pool:
        hosts = list(pool.map(inspect, alive))
    return {"subnet": str(subnet), "hosts": hosts}


def _classify_bluetooth(name, icon, device_class, uuids):
    major = -1 if device_class is None else (device_class >> 8) & 0x1F
    looks_audio = icon.startswith("audio") or bool(AUDIO_NAME.search(name)) or (not icon and (major == 4 or any(uuid.startswith(prefix) for uuid in uuids for prefix in AUDIO_UUIDS)))
    if looks_audio and icon not in ("phone", "computer"):
        kind = "headset" if icon in ("audio-headset", "audio-headphones") or HEADSET_NAME.search(name) else "speaker"
        return True, kind, "Bluetooth headset" if kind == "headset" else "Bluetooth speaker"
    if icon == "phone":
        return False, "phone", "Phone"
    if icon == "computer":
        return False, "laptop", "Computer"
    return False, None, ""


def scan_bluetooth():
    try:
        result = subprocess.run(["bluetoothctl", "--timeout", str(SCAN_SECONDS), "scan", "on"], capture_output=True, text=True, timeout=SCAN_SECONDS + 4)
    except FileNotFoundError:
        return {"available": False, "error": "Bluetooth tools (bluetoothctl) not found on the server.", "hosts": []}
    except subprocess.TimeoutExpired as error:
        output = (error.stdout or b"").decode(errors="replace") if isinstance(error.stdout, bytes) else (error.stdout or "")
        result = subprocess.CompletedProcess(args=error.cmd, returncode=0, stdout=output, stderr="")

    seen = {}
    for raw in ANSI.sub("", result.stdout or "").splitlines():
        line = raw.strip()
        match = re.match(r"^\[(NEW|CHG)\] Device ([0-9A-F]{2}(?::[0-9A-F]{2}){5}) ?(.*)$", line, re.I)
        if not match:
            continue
        action, mac, rest = match.groups()
        data = seen.setdefault(mac.upper(), {"uuids": []})
        if action == "NEW":
            if rest:
                data["name"] = rest
            continue
        if ": " not in rest:
            continue
        key, value = rest.split(": ", 1)
        if key == "Name":
            data["name"] = value
        elif key == "Alias":
            data["alias"] = value
        elif key == "Icon":
            data["icon"] = value
        elif key == "Class":
            try:
                data["class"] = int(value, 16)
            except ValueError:
                pass
        elif key == "RSSI":
            rssi = re.search(r"\((-?\d+)\)", value)
            if rssi:
                data["rssi"] = int(rssi.group(1))
        elif key == "UUIDs":
            data["uuids"].append(value.lower())

    hosts = []
    for mac, data in seen.items():
        dashed = mac.replace(":", "-")
        raw_name = (data.get("alias") or data.get("name") or "")[:60]
        name = "Unknown device" if not raw_name or raw_name == dashed else raw_name
        adoptable, kind, label = _classify_bluetooth(name, data.get("icon", ""), data.get("class"), data["uuids"])
        hosts.append({
            "identifier": f"BT-{mac}", "name": name, "type": "OTHER", "manufacturer": "Bluetooth", "model": label,
            "macAddress": mac, "params": {"mac": mac, "via": "bluetooth", **({"kind": kind} if kind else {})},
            "adoptable": adoptable, "reason": None if adoptable else "Not audio gear. Only Bluetooth headsets and speakers can be adopted.",
            "via": "bluetooth", "kind": kind, "rssi": data.get("rssi"),
        })
    return {"available": True, "hosts": hosts}