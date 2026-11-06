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


def trend_teste():
    return {
        "title": "Tema em alta",
        "traffic": 100,
        "news_url": "https://a.example/pouco",
        "news_urls": ["https://a.example/pouco", "https://b.example/completo"],
        "image_url": "https://a.example/foto.jpg",
    }


class EscolheMelhorFonteTest(unittest.TestCase):
    def _main_com_fontes(self, paginas):
        module = load_module()
        chamadas = {"generate": 0, "envios": 0, "fonte": None, "estado": []}

        def fake_get(url, **kwargs):
            r = mock.Mock()
            r.text = paginas.get(url, "<html>vazio</html>")
            return r

        def fake_generate(trend, fonte):
            chamadas["generate"] += 1
            chamadas["fonte"] = fonte
            return "T", "<p>x</p>"

        def fake_run(*args, **kwargs):
            chamadas["envios"] += 1

        env = {"EMAIL_USER": "a@b.c", "APP_PASSWORD": "x", "LLM_API_KEY": "k"}
        with mock.patch.dict("os.environ", env, clear=True):
            with mock.patch.object(module.TrendFetcher, "fetch_top_trend", return_value=trend_teste()):
                with mock.patch.object(module.requests, "get", side_effect=fake_get):
                    with mock.patch.object(module.ContentGenerator, "generate", side_effect=fake_generate):
                        with mock.patch.object(module.ContentGenerator, "montar_html", return_value="<p>x</p>"):
                            with mock.patch.object(module.subprocess, "run", side_effect=fake_run):
                                with mock.patch.object(module, "salvar_estado", side_effect=lambda p: chamadas.update(estado=p)):
                                    module.main(["--email", "destino@blogger.com"])
        return chamadas

    def test_usa_a_fonte_mais_completa(self):
        chamadas = self._main_com_fontes({
            "https://a.example/pouco": "<p>curto</p>",
            "https://b.example/completo": "<p>" + ("palavra " * 400) + "</p>",
        })
        self.assertGreater(len(chamadas["fonte"]), 1000)
        self.assertIn("palavra", chamadas["fonte"])
        self.assertEqual(chamadas["envios"], 1)

    def test_fonte_curta_nao_publica_e_registra_a_trend(self):
        chamadas = self._main_com_fontes({
            "https://a.example/pouco": "",
            "https://b.example/completo": "",
        })
        self.assertEqual(chamadas["generate"], 0)
        self.assertEqual(chamadas["envios"], 0)
        self.assertEqual([p["titulo"] for p in chamadas["estado"]], ["Tema em alta"])


if __name__ == "__main__":
    unittest.main()
