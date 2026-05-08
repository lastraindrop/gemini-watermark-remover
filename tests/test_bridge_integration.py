import os
import sys
import unittest
import shutil
import json

# Ensure we can import from the parent directory
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from python.remover import GeminiWatermarkRemover

class TestBridgeIntegration(unittest.TestCase):
    def setUp(self):
        self.project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.remover = GeminiWatermarkRemover(self.project_root)
        self.sample_img = os.path.join(self.project_root, "sample", "other", "6d4b058033994c648ef19af225c79397.jpeg~tplv-a9rns2rl98-image_pre_watermark_1_6b-2.png")
        self.test_output = os.path.join(self.project_root, "test_output_integration")
        
        if os.path.exists(self.test_output):
            shutil.rmtree(self.test_output)
        os.makedirs(self.test_output)

    def test_end_to_end_removal(self):
        """Tests the full flow from Python bridge to Node CLI back to Python result."""
        print(f"\n[TEST] Processing: {os.path.basename(self.sample_img)}")
        
        # Verify sample exists
        if not os.path.exists(self.sample_img):
            self.skipTest(f"Sample image not found at {self.sample_img}")

        # This simulates the GUI's run_process logic
        results = self.remover.remove_watermark(
            self.sample_img, 
            self.test_output, 
            deep_scan=True, 
            noise_reduction=True, 
            profile="doubao"
        )
        
        self.assertTrue(len(results) > 0, "Should return at least one result")
        res = results[0]
        
        # Verify status
        self.assertEqual(res.get("status"), "success", f"Processing failed: {res.get('message')}")
        
        # Verify result fields
        conf = res.get("confidence")
        self.assertIsInstance(conf, (int, float), f"Confidence should be a number, got {type(conf)}")
        self.assertGreater(conf, 0.20, f"Confidence too low: {conf}")
        
        output_file = res.get("output")
        self.assertTrue(os.path.exists(output_file), f"Output file not found: {output_file}")
        
        print(f"Integration Success! Confidence: {conf*100:.1f}%, Output: {os.path.basename(output_file)}")

    def tearDown(self):
        # We keep the output for manual inspection if needed, or cleanup
        pass

if __name__ == "__main__":
    unittest.main()
