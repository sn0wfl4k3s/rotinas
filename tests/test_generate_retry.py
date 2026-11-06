import importlib.util
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


class GenerateRetryTest(unittest.TestCase):
    def setUp(self):
        self.module = load_module()
        self.trend = {"title": "Tema", "image_url": None}
        patcher = mock.patch.dict("os.environ", {"LLM_API_KEY": "k"}, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)
        sleep = mock.patch.object(self.module.time, "sleep")
        sleep.start()
        self.addCleanup(sleep.stop)

    def _resp(self, status, body=None):
        r = mock.Mock()
        r.status_code = status
        r.text = "corpo"
        r.json.return_value = body or {}
        r.raise_for_status.side_effect = None
        return r

    def test_429_apos_tres_tentativas_vira_systemexit(self):
        gen = self.module.ContentGenerator()
        with mock.patch.object(self.module.requests, "post", return_value=self._resp(429)):
            with self.assertRaises(SystemExit) as ctx:
                gen.generate(self.trend, "fonte")
        self.assertIn("429", str(ctx.exception))

    def test_429_depois_sucesso_retorna_conteudo(self):
        gen = self.module.ContentGenerator()
        ok = self._resp(200, {"choices": [{"message": {"content": '{"titulo": "T", "html": "<p>x</p>"}'}}]})
        with mock.patch.object(self.module.requests, "post", side_effect=[self._resp(429), ok]) as post:
            titulo, corpo = gen.generate(self.trend, "fonte")
        self.assertEqual(post.call_count, 2)
        self.assertEqual((titulo, corpo), ("T", "<p>x</p>"))

    def test_erro_de_rede_tenta_de_novo(self):
        gen = self.module.ContentGenerator()
        ok = self._resp(200, {"choices": [{"message": {"content": '{"titulo": "T", "html": "<p>x</p>"}'}}]})
        erro = self.module.requests.ConnectionError("caiu")
        with mock.patch.object(self.module.requests, "post", side_effect=[erro, ok]) as post:
            titulo, corpo = gen.generate(self.trend, "fonte")
        self.assertEqual(post.call_count, 2)
        self.assertEqual((titulo, corpo), ("T", "<p>x</p>"))

    def test_erro_de_rede_apos_tres_tentativas_vira_systemexit(self):
        gen = self.module.ContentGenerator()
        erro = self.module.requests.ConnectionError("caiu")
        with mock.patch.object(self.module.requests, "post", side_effect=erro):
            with self.assertRaises(SystemExit):
                gen.generate(self.trend, "fonte")

    def test_sem_chave_sai_com_erro(self):
        with mock.patch.dict("os.environ", {}, clear=True):
            gen = self.module.ContentGenerator()
            with self.assertRaises(SystemExit):
                gen.generate(self.trend, "fonte")


if __name__ == "__main__":
    unittest.main()
