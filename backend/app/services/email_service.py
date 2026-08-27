import os
import logging
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

logger = logging.getLogger(__name__)

class EmailService:
    @staticmethod
    def send_welcome_email(to_email: str, full_name: str, setup_link: str) -> bool:
        """
        Sends an automated welcome email with a link to set the account's own
        password (same token-based flow as password reset). Never emails a
        plaintext password -- that would sit in the recipient's inbox and any
        mail relay/logging system indefinitely.
        Returns True if sent (or intentionally skipped in local dev), False if
        a real send attempt failed.
        """
        api_key = os.environ.get("SENDGRID_API_KEY", "dummy_dev_key")
        from_email = os.environ.get("SENDGRID_FROM_EMAIL", "noreply@whatsappcrm.com")

        # If no real API key is configured (dev mode), skip the real send.
        # Never log the setup link itself, even in dev -- it's a live credential.
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
                Click the link below to set your password and log in. This link expires in 30 minutes:<br><br>
                <a href="{setup_link}">{setup_link}</a><br><br>
                <em>If you weren't expecting this, contact your Admin.</em>
            ''')
            
        try:
            sg = SendGridAPIClient(api_key)
            sg.send(message)
            return True
        except Exception:
            logger.exception("Failed to send welcome email to %s", to_email)
            return False

    @staticmethod
    def send_password_reset_email(to_email: str, full_name: str, reset_link: str) -> bool:
        """
        Sends a password reset link. Returns True if sent (or intentionally
        skipped in local dev), False if a real send attempt failed.
        """
        api_key = os.environ.get("SENDGRID_API_KEY", "dummy_dev_key")
        from_email = os.environ.get("SENDGRID_FROM_EMAIL", "noreply@whatsappcrm.com")

        # If no real API key is configured (dev mode), skip the real send.
        # Never log the reset link itself, even in dev -- it's a live credential.
        if api_key == "dummy_dev_key":
            logger.info("[DEV MODE] Skipping real password reset email to %s (SENDGRID_API_KEY not configured).", to_email)
            return True

        message = Mail(
            from_email=from_email,
            to_emails=to_email,
            subject='Reset your WhatsApp CRM password',
            html_content=f'''
                <strong>Hello {full_name},</strong><br><br>
                We received a request to reset your WhatsApp CRM password.<br>
                Click the link below to choose a new password. This link expires in 30 minutes:<br><br>
                <a href="{reset_link}">{reset_link}</a><br><br>
                <em>If you didn't request this, you can safely ignore this email.</em>
            ''')

        try:
            sg = SendGridAPIClient(api_key)
            sg.send(message)
            return True
        except Exception:
            logger.exception("Failed to send password reset email to %s", to_email)
            return False
