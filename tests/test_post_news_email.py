import importlib.util
import subprocess
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "post_news.py"


def load_module():
    spec = importlib.util.spec_from_file_location("post_news", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PostNewsEmailTest(unittest.TestCase):
    def test_main_chama_enviar_email_com_credenciais_do_ambiente(self):
        module = load_module()
        self.assertFalse(hasattr(module, "EmailDispatcher"))
        trend = {
            "title": "Tema em alta",
            "traffic": 100,
            "news_url": "https://fonte.example/noticia",
            "image_url": "https://fonte.example/foto.jpg",
        }
        captured = {}

        def fake_run(cmd, **kwargs):
            captured["cmd"] = cmd
            captured["env"] = kwargs.get("env")
            return subprocess.CompletedProcess(cmd, 0, "", "")

        env = {
            "EMAIL_USER": "remetente@gmail.com",
            "APP_PASSWORD": "senha-app",
            "PATH": "/usr/bin",
        }
        with mock.patch.dict("os.environ", env, clear=True):
            with mock.patch.object(module.TrendFetcher, "fetch_top_trend", return_value=trend):
                with mock.patch.object(module.requests, "get") as page:
                    page.return_value.text = "<html><body>" + ("palavra " * 400) + "</body></html>"
                    with mock.patch.object(module.ContentGenerator, "generate", return_value=("Título gerado", "<p>materia</p>")):
                        with mock.patch.object(module.ContentGenerator, "montar_html", return_value="<p>materia</p>"):
                            with mock.patch.object(module.subprocess, "run", side_effect=fake_run):
                                with mock.patch.object(module, "salvar_estado"):
                                    module.main(["--email", "destino@blogger.com"])

        cmd = captured["cmd"]
        self.assertEqual(cmd[0], sys.executable)
        self.assertTrue(str(cmd[1]).endswith("scripts/enviar_email.py"))
        self.assertEqual(cmd[2], "destino@blogger.com")
        self.assertEqual(cmd[3], "Título gerado")
        self.assertEqual(cmd[4], "<p>materia</p>")
        self.assertEqual(captured["env"]["EMAIL_USER"], "remetente@gmail.com")
        self.assertEqual(captured["env"]["APP_PASSWORD"], "senha-app")

    def test_falha_de_envio_vira_log_e_sai_com_erro(self):
        module = load_module()
        trend = {
            "title": "Tema em alta",
            "traffic": 100,
            "news_url": "https://fonte.example/noticia",
            "image_url": None,
        }

        def fake_run(cmd, **kwargs):
            raise subprocess.CalledProcessError(1, cmd, output="", stderr="EMAIL_USER e APP_PASSWORD são obrigatórios\n")

        with mock.patch.object(module.TrendFetcher, "fetch_top_trend", return_value=trend):
            with mock.patch.object(module.requests, "get") as page:
                page.return_value.text = "palavra " * 400
                with mock.patch.object(module.ContentGenerator, "generate", return_value=("Título", "<p>x</p>")):
                    with mock.patch.object(module.ContentGenerator, "montar_html", return_value="<p>x</p>"):
                        with mock.patch.object(module.subprocess, "run", side_effect=fake_run):
                            with self.assertLogs(module.logging.getLogger(), level="ERROR") as logs:
                                with self.assertRaises(SystemExit) as raised:
                                    module.main(["--email", "destino@blogger.com"])

        self.assertNotEqual(raised.exception.code, 0)
        joined = "\n".join(logs.output)
        self.assertIn("EMAIL_USER e APP_PASSWORD são obrigatórios", joined)


if __name__ == "__main__":
    unittest.main()
