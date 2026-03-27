import os
import json
import subprocess
import sys
import shutil
from typing import List, Dict, Any, Union, Optional

class GeminiWatermarkRemover:
    """
    Python bridge for gemini-watermark-remover.
    Requires Node.js.
    """
    def __init__(self, project_path: Optional[str] = None):
        # 1. Resolve Project Root
        if project_path:
            self.project_path = os.path.abspath(project_path)
        else:
            # Try to find current working directory or package location
            self.project_path = os.getcwd()

        # 2. Resolve CLI Path (Environment Variable > Specified Path > Local Search)
        env_path = os.environ.get("GWR_CLI_PATH")
        if env_path:
            self.cli_path = os.path.abspath(env_path)
        else:
            local_cli = os.path.join(self.project_path, "src", "cli.js")
            if os.path.exists(local_cli):
                self.cli_path = local_cli
            else:
                # Last resort: try to find it in the global binaries if it was linked
                self.cli_path = shutil.which("gemini-watermark-remover")
        
        self._verify_environment()

    def _verify_environment(self) -> None:
        """Verifies that Node.js and the CLI tool are available."""
        if not self.cli_path or not os.path.exists(self.cli_path):
            raise FileNotFoundError(
                f"CLI tool not found. Please provide a valid project_path, "
                "link the package globally, or set GWR_CLI_PATH."
            )
        
        try:
            subprocess.run(["node", "--version"], capture_output=True, check=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            raise RuntimeError("Node.js is not installed or not in PATH.")

    def remove_watermark(self, input_path: str, output_path: str) -> List[Dict[str, Any]]:
        """
        Processes a single image or a directory.
        Returns a list of result dictionaries.
        """
        
        try:
            # We use a wrapper if cli_path is a JS file, or direct execution if it's a binary/link
            exec_cmd = ["node", self.cli_path] if self.cli_path.endswith(".js") else [self.cli_path]
            final_cmd = exec_cmd + ["--input", input_path, "--output", output_path, "--json"]
            
            result = subprocess.run(final_cmd, capture_output=True, text=True, check=True)
            results = []
            for line in result.stdout.splitlines():
                line = line.strip()
                if line.startswith('{') and line.endswith('}'):
                    try:
                        results.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
            return results
        except subprocess.CalledProcessError as e:
            error_msg = (e.stderr or e.stdout).strip()
            # Try to find JSON in the error message
            for line in error_msg.splitlines():
                if line.strip().startswith('{'):
                    try:
                        return [json.loads(line)]
                    except Exception:
                        pass
            return [{"status": "error", "message": error_msg}]

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
