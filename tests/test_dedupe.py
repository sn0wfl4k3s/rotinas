import importlib.util
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "post_news.py"


def load_module():
    spec = importlib.util.spec_from_file_location("post_news", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def post(titulo, horas_atras=0):
    quando = datetime.now(timezone.utc) - timedelta(hours=horas_atras)
    return {"titulo": titulo, "quando": quando.isoformat()}


class DedupeTest(unittest.TestCase):
    def setUp(self):
        self.module = load_module()

    def test_a_b_a_nao_duplica_a(self):
        posts = [post("A"), post("B")]
        self.assertTrue(self.module.ja_publicado({"title": "A"}, posts))

    def test_fora_da_janela_publica_de_novo(self):
        posts = [post("A", horas_atras=13)]
        self.assertFalse(self.module.ja_publicado({"title": "A"}, posts))

    def test_case_e_acento_nao_diferenciam(self):
        posts = [post("Operário x Sport Recife")]
        self.assertTrue(self.module.ja_publicado({"title": "operario x sport recife"}, posts))

    def test_quando_sem_timezone_nao_derruba(self):
        posts = [{"titulo": "A", "quando": datetime.now().replace(tzinfo=None).isoformat()}]
        self.assertTrue(self.module.ja_publicado({"title": "A"}, posts))

    def test_le_formato_antigo_de_um_post(self):
        antigo = post("A")
        with tempfile.TemporaryDirectory() as tmp:
            caminho = Path(tmp) / "last_post.json"
            caminho.write_text(json.dumps(antigo))
            with mock.patch.object(self.module, "STATE_PATH", str(caminho)):
                self.assertEqual(self.module.carregar_estado(), [antigo])

    def test_mesma_url_mesmo_com_titulo_diferente_e_duplicado(self):
        posts = [{"titulo": "Vitória x Fluminense", "urls": ["https://a.example/jogo"], "quando": post("x")["quando"]}]
        trend = {"title": "ec vitória x fluminense", "news_urls": ["https://a.example/jogo"]}
        self.assertTrue(self.module.ja_publicado(trend, posts))

    def test_registrar_post_grava_lista_e_poda_antigos(self):
        with tempfile.TemporaryDirectory() as tmp:
            caminho = Path(tmp) / "state" / "last_post.json"
            with mock.patch.object(self.module, "STATE_PATH", str(caminho)):
                self.module.registrar_post(
                    [post("velha", horas_atras=20)],
                    {"title": "nova", "news_urls": ["https://a.example/nova"]},
                )
                gravado = json.loads(caminho.read_text())["posts"]
        self.assertEqual([p["titulo"] for p in gravado], ["nova"])
        self.assertEqual(gravado[0]["urls"], ["https://a.example/nova"])


class MontarHtmlTest(unittest.TestCase):
    def setUp(self):
        self.module = load_module()

    def test_escapa_aspas_do_titulo(self):
        html = self.module.ContentGenerator.montar_html(
            {"title": 'Tema "especial" <b>', "image_url": "https://x.example/a.jpg?q=1&r=2"},
            "<p>corpo</p>",
        )
        self.assertIn("&quot;", html)
        self.assertIn("&amp;r=2", html)
        self.assertIn("&lt;b&gt;", html)
        self.assertIn("<p>corpo</p>", html)

    def test_sem_imagem_retorna_so_o_corpo(self):
        self.assertEqual(
            self.module.ContentGenerator.montar_html({"title": "T", "image_url": None}, "<p>x</p>"),
            "<p>x</p>",
        )


if __name__ == "__main__":
    unittest.main()
