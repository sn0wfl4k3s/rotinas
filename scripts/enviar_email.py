import os
import smtplib
import ssl
import sys
from email.message import EmailMessage

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587


def send_email(to, subject, html):
    user = os.environ.get("EMAIL_USER")
    password = os.environ.get("APP_PASSWORD")
    if not user or not password:
        raise SystemExit("EMAIL_USER e APP_PASSWORD são obrigatórios")

    message = EmailMessage()
    message["From"] = user
    message["To"] = to
    message["Subject"] = subject
    message.set_content(html, subtype="html")

    context = ssl.create_default_context()
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as smtp:
        smtp.starttls(context=context)
        smtp.login(user, password)
        smtp.send_message(message)


def main(argv):
    if len(argv) != 3:
        raise SystemExit("uso: enviar_email.py <destinatario> <assunto> <corpo_html>")
    send_email(argv[0], argv[1], argv[2])


if __name__ == "__main__":
    main(sys.argv[1:])
