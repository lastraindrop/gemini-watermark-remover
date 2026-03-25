import subprocess
import json
import os
import sys
from typing import List, Dict, Any, Union, Optional

class GeminiWatermarkRemover:
    """
    Python bridge for gemini-watermark-remover.
    Requires Node.js and the project to be built.
    """
    def __init__(self, project_path: str):
        self.project_path = os.path.abspath(project_path)
        self.cli_path = os.path.join(self.project_path, "src", "cli.js")
        
        self._verify_environment()

    def _verify_environment(self) -> None:
        """Verifies that Node.js and the CLI tool are available."""
        if not os.path.exists(self.cli_path):
            raise FileNotFoundError(f"CLI tool not found at {self.cli_path}. Ensure the project path is correct.")
        
        try:
            subprocess.run(["node", "--version"], capture_output=True, check=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            raise RuntimeError("Node.js is not installed or not in PATH.")

    def remove_watermark(self, input_path: str, output_path: str) -> List[Dict[str, Any]]:
        """
        Processes a single image or a directory.
        Returns a list of result dictionaries.
        """
        cmd = [
            "node", 
            self.cli_path, 
            "--input", input_path, 
            "--output", output_path,
            "--json"
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            results = []
            for line in result.stdout.strip().split('\n'):
                if line.strip():
                    try:
                        results.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
            return results
        except subprocess.CalledProcessError as e:
            error_msg = e.stderr or e.stdout
            try:
                return [json.loads(error_msg)]
            except:
                return [{"status": "error", "message": error_msg.strip()}]

    def remove_watermark_pipe(self, image_bytes: bytes) -> bytes:
        """
        Processes image via stdin/stdout pipe.
        Returns processed image bytes.
        """
        cmd = ["node", self.cli_path, "--pipe"]
        try:
            result = subprocess.run(
                cmd, 
                input=image_bytes, 
                capture_output=True, 
                check=True
            )
            return result.stdout
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"Pipe processing failed: {e.stderr.decode() if e.stderr else 'Unknown error'}")

# Example Usage
if __name__ == "__main__":
    try:
        remover = GeminiWatermarkRemover("./")
        print("✅ Gemini Watermark Remover Bridge Ready.")
        
        # Batch process example
        # results = remover.remove_watermark("./docs", "./test_output")
        # print(json.dumps(results, indent=2))
    except Exception as e:
        print(f"❌ Initialization failed: {e}")
        sys.exit(1)
