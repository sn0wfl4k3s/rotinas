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


class ExtrairTextoTest(unittest.TestCase):
    def test_remove_markup_e_scripts(self):
        module = load_module()
        html = """
        <html><head><style>.a{color:red}</style><script>var x=1;</script></head>
        <body><h1>Manchete</h1><p>Primeiro&nbsp;parágrafo.</p>
        <p>Segundo   parágrafo.</p></body></html>
        """
        texto = module.extrair_texto(html)
        self.assertIn("Manchete", texto)
        self.assertIn("Primeiro parágrafo.", texto)
        self.assertNotIn("<", texto)
        self.assertNotIn("var x", texto)
        self.assertNotIn("color:red", texto)

    def test_respeita_limite(self):
        module = load_module()
        self.assertEqual(len(module.extrair_texto("a" * 500, limite=100)), 100)


if __name__ == "__main__":
    unittest.main()
