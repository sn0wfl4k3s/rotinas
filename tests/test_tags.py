import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "post_news.py"


def load_module():
    spec = importlib.util.spec_from_file_location("post_news", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TagsTest(unittest.TestCase):
    def setUp(self):
        self.module = load_module()

    def test_minusculo_sem_espaco(self):
        self.assertEqual(
            self.module.normalizar_tags("Nubank suspende saques [Esportes, Futebol]"),
            "Nubank suspende saques [esportes,futebol]",
        )

    def test_tag_com_duas_palavras_perde_espaco(self):
        self.assertEqual(
            self.module.normalizar_tags("Vitória x Fluminense [Operário, Sport Recife]"),
            "Vitória x Fluminense [operário,sportrecife]",
        )

    def test_sem_tags_nao_muda(self):
        self.assertEqual(self.module.normalizar_tags("Título normal"), "Título normal")

    def test_colchete_no_meio_nao_e_tag(self):
        self.assertEqual(
            self.module.normalizar_tags("Caso [raro] no meio da frase"),
            "Caso [raro] no meio da frase",
        )

    def test_parse_aplica_normalizacao(self):
        bruto = '{"titulo": "Tema [Brasil, Economia]", "html": "<p>x</p>"}'
        titulo, corpo = self.module.ContentGenerator._parse(bruto, {"title": "Tema"})
        self.assertEqual(titulo, "Tema [brasil,economia]")
        self.assertEqual(corpo, "<p>x</p>")


if __name__ == "__main__":
    unittest.main()
