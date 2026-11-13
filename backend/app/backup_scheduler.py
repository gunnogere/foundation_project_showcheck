from app.backup import upload_snapshot

import schedule
import time
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("logs/backup_scheduler.log"),
        logging.StreamHandler(),
    ],
)


def run_weekly_backup():
    try:
        logging.info("Starting weekly backup...")
        upload_snapshot()
        logging.info("Weekly backup completed successfully.")

    except Exception:
        logging.exception("Weekly backup failed. Please check the logs for details.")


def scheduler():
    print("Backup scheduler started. Weekly backups scheduled for Sundays at 8 AM.")
    schedule.every().sunday.at("08:00").do(run_weekly_backup)
    logging.info(
        "Backup scheduler started. Weekly backups scheduled for Sundays at 8 AM."
    )
    while True:
        schedule.run_pending()
        time.sleep(60)
        logging.exception("Backup scheduler encountered an error and will stop.")
        logging.info(
            "Backup scheduler stopped. Please check the logs for details and restart the scheduler."
        )


if __name__ == "__main__":
    scheduler()
