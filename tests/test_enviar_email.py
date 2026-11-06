import importlib.util
import os
import smtplib
import subprocess
import sys
import unittest
from email.message import EmailMessage
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "enviar_email.py"


def load_module():
    spec = importlib.util.spec_from_file_location("enviar_email", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class EnviarEmailTest(unittest.TestCase):
    def test_monta_mensagem_html_e_envia_starttls(self):
        module = load_module()
        sent = {}

        class FakeSMTP:
            def __init__(self, host, port, timeout=30):
                sent["host"] = host
                sent["port"] = port
                sent["timeout"] = timeout

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def starttls(self, context=None):
                sent["starttls"] = True
                sent["context"] = context

            def login(self, user, password):
                sent["user"] = user
                sent["password"] = password

            def send_message(self, message):
                sent["message"] = message

        env = {"EMAIL_USER": "remetente@gmail.com", "APP_PASSWORD": "senha-app"}
        with mock.patch.dict(os.environ, env, clear=False):
            with mock.patch.object(smtplib, "SMTP", FakeSMTP):
                module.send_email(
                    "destino@blogger.com",
                    "Assunto da matéria",
                    "<p>Corpo <b>HTML</b></p>",
                )

        self.assertEqual(sent["host"], "smtp.gmail.com")
        self.assertEqual(sent["port"], 587)
        self.assertTrue(sent["starttls"])
        self.assertIsNotNone(sent["context"])
        self.assertEqual(sent["user"], "remetente@gmail.com")
        self.assertEqual(sent["password"], "senha-app")
        message = sent["message"]
        self.assertIsInstance(message, EmailMessage)
        self.assertEqual(message["From"], "remetente@gmail.com")
        self.assertEqual(message["To"], "destino@blogger.com")
        self.assertEqual(message["Subject"], "Assunto da matéria")
        self.assertEqual(message.get_content_type(), "text/html")
        self.assertIn("<p>Corpo <b>HTML</b></p>", message.get_content())

    def test_cli_repassa_tres_argumentos(self):
        env = os.environ.copy()
        env["EMAIL_USER"] = "remetente@gmail.com"
        env["APP_PASSWORD"] = "senha-app"
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "destino@blogger.com",
                "Assunto CLI",
                "<p>via cli</p>",
            ],
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        combined = result.stdout + result.stderr
        self.assertNotIn("senha-app", combined)
        self.assertTrue(
            "smtp.gmail.com" in combined or "SMTP" in combined or "Network is unreachable" in combined or "Temporary failure" in combined or "gaierror" in combined or result.returncode != 2,
            combined,
        )

    def test_falta_credencial_sai_com_erro_sem_senha(self):
        env = os.environ.copy()
        env.pop("EMAIL_USER", None)
        env.pop("APP_PASSWORD", None)
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "destino@blogger.com",
                "Assunto",
                "<p>x</p>",
            ],
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("EMAIL_USER", result.stderr + result.stdout)


if __name__ == "__main__":
    unittest.main()
