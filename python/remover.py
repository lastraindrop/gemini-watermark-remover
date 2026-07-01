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
            # v1.6 Improvement: Use script's base directory instead of plain getcwd()
            self.project_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

        # 2. Resolve CLI Path
        env_path = os.environ.get("GWR_CLI_PATH")
        if env_path:
            self.cli_path = os.path.abspath(env_path)
        else:
            # Check local src/cli.js relative to project_path
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

    @staticmethod
    def calculate_timeout_seconds_for_pixels(pixel_count: int) -> int:
        """Return a bounded processing timeout scaled by image size."""
        try:
            pixels = max(0, int(pixel_count))
        except (TypeError, ValueError):
            pixels = 0
        megapixels = pixels / 1_000_000
        return max(60, min(600, int(megapixels * 10)))

    def _calculate_timeout_seconds(self, input_path: str) -> int:
        """Estimate timeout from PNG/JPEG dimensions when cheaply available."""
        try:
            from PIL import Image  # type: ignore
            if os.path.isfile(input_path):
                with Image.open(input_path) as img:
                    return self.calculate_timeout_seconds_for_pixels(img.width * img.height)
        except Exception:
            pass
        return 60

    def remove_watermark(self, input_path: str, output_path: str, deep_scan: bool = True, noise_reduction: bool = False, profile: str = "gemini", **kwargs) -> List[Dict[str, Any]]:
        """
        Processes a single image or a directory.
        Returns a list of result dictionaries.
        Supports advanced parameters: probe_threshold and fallback_threshold.
        """
        
        try:
            # We use a wrapper if cli_path is a JS file, or direct execution if it's a binary/link
            exec_cmd = ["node", self.cli_path] if self.cli_path.endswith(".js") else [self.cli_path]
            final_cmd = exec_cmd + ["remove", input_path, "--output", output_path, "--json", "--profile", profile]
            
            if not deep_scan: final_cmd.append("--no-deepScan")
            if noise_reduction: final_cmd.append("--noiseReduction")
            
            # v2.1 Advanced Argument Passing
            if "probe_threshold" in kwargs:
                final_cmd.extend(["--probeThreshold", str(kwargs["probe_threshold"])])
            if "fallback_threshold" in kwargs:
                final_cmd.extend(["--fallbackThreshold", str(kwargs["fallback_threshold"])])
            
            # v1.9.8 Enhancement: Use explicit timeout and capture all output
            timeout_seconds = self._calculate_timeout_seconds(input_path)
            result = subprocess.run(final_cmd, capture_output=True, text=True, check=False, timeout=timeout_seconds)
            
            results = []
            combined_output = (result.stdout or "") + (result.stderr or "")
            
            for line in combined_output.splitlines():
                line = line.strip()
                if line.startswith('{') and line.endswith('}') and '"status"' in line:
                    try:
                        results.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
            
            if not results and result.returncode != 0:
                return [{"status": "error", "message": f"CLI Exit {result.returncode}: {result.stderr.strip() or 'Unknown error'}"}]
                
            return results
        except subprocess.TimeoutExpired as e:
            timeout = getattr(e, 'timeout', 60)
            return [{"status": "error", "message": f"Processing timed out after {int(timeout)}s"}]
        except Exception as e:
            return [{"status": "error", "message": str(e)}]

    def remove_watermark_pipe(self, image_bytes: bytes, deep_scan: bool = True, noise_reduction: bool = False, profile: str = "gemini") -> bytes:
        """
        Processes image via stdin/stdout pipe.
        Returns processed image bytes.
        """
        if self.cli_path.endswith(".js"):
            cmd = ["node", self.cli_path, "remove", "--pipe", "--profile", profile]
        else:
            cmd = [self.cli_path, "remove", "--pipe", "--profile", profile]
        if not deep_scan: cmd.append("--no-deepScan")
        if noise_reduction: cmd.append("--noiseReduction")
        
        try:
            result = subprocess.run(
                cmd, 
                input=image_bytes, 
                capture_output=True, 
                check=True
            )
            return result.stdout
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"Pipe processing failed: {e.stderr.decode('utf-8', errors='replace') if e.stderr else 'Unknown error'}")

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
