import { $, api } from "./common.js";

// Already signed in? Go straight to the dashboard.
api("/auth/me").then(() => (location.href = "index.html")).catch(() => {});

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#error").textContent = "";
  $("#submit").disabled = true;
  try {
    await api("/auth/login", { method: "POST", body: { email: $("#email").value, password: $("#password").value } });
    location.href = "index.html";
  } catch (err) {
    $("#error").textContent = err.message;
    $("#submit").disabled = false;
  }
});
