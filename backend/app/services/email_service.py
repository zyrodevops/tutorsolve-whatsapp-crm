import os
import logging
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

logger = logging.getLogger(__name__)

class EmailService:
    @staticmethod
    def send_welcome_email(to_email: str, full_name: str, raw_password: str) -> bool:
        """
        Sends an automated welcome email with login credentials.
        Returns True if sent (or intentionally skipped in local dev), False if
        a real send attempt failed.
        """
        api_key = os.environ.get("SENDGRID_API_KEY", "dummy_dev_key")
        from_email = os.environ.get("SENDGRID_FROM_EMAIL", "noreply@whatsappcrm.com")

        # If no real API key is configured (dev mode), skip the real send.
        # Never log the password itself, even in dev.
        if api_key == "dummy_dev_key":
            logger.info("[DEV MODE] Skipping real welcome email to %s (SENDGRID_API_KEY not configured).", to_email)
            return True

        message = Mail(
            from_email=from_email,
            to_emails=to_email,
            subject='Welcome to WhatsApp CRM',
            html_content=f'''
                <strong>Hello {full_name},</strong><br><br>
                Your account for the WhatsApp CRM has been created by your Admin.<br>
                Please log in using the following credentials:<br><br>
                <strong>Email:</strong> {to_email}<br>
                <strong>Password:</strong> {raw_password}<br><br>
                <em>We recommend changing this password upon your first login.</em>
            ''')
            
        try:
            sg = SendGridAPIClient(api_key)
            sg.send(message)
            return True
        except Exception:
            logger.exception("Failed to send welcome email to %s", to_email)
            return False
