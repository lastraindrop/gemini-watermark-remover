import tkinter as tk
from tkinter import ttk, filedialog, scrolledtext, messagebox
import threading
import os
import sys
import json
import time
from datetime import datetime
from remover import GeminiWatermarkRemover

class ModernGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Gemini Watermark Remover (Desktop) v1.6")
        self.root.geometry("960x700")

        # Centralized Theme & Configuration (v1.6)
        self.THEME = {
            "bg": "#0f172a",
            "card": "#1e293b",
            "primary": "#10B981", # Emerald
            "text": "#f8fafc",
            "accent": "#4f46e5", # Indigo
            "warn": "#f59e0b",
            "err": "#ef4444",
            "font_main": ("Inter", 10),
            "font_bold": ("Inter", 11, "bold"),
            "font_header": ("Inter", 24, "bold")
        }

        self.root.configure(bg=self.THEME["bg"])

        # Determine project root relative to this CLI file
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        try:
            self.remover = GeminiWatermarkRemover(base_dir)
        except Exception as e:
            self.remover = None
            self.root.after(100, lambda: self.log(f"Backend Initialization Failed: {str(e)}", "err"))
        
        self.input_paths = None
        self.deep_scan_var = tk.BooleanVar(value=True)
        self.noise_reduction_var = tk.BooleanVar(value=False)

        self._build_ui()
        self._load_prefs()
        self.log("Desktop Environment v1.6 Initialized.", "success")

    def _get_prefs_path(self):
        return os.path.join(os.path.dirname(os.path.abspath(__file__)), "prefs.json")

    def _load_prefs(self):
        path = self._get_prefs_path()
        if os.path.exists(path):
            try:
                with open(path, 'r') as f:
                    prefs = json.load(f)
                    if "input" in prefs and prefs["input"]:
                        self.input_entry.insert(0, prefs["input"])
                        self.input_paths = prefs["input"]
                    if "output" in prefs and prefs["output"]:
                        self.output_entry.insert(0, prefs["output"])
            except Exception as e:
                print(f"Failed to load prefs: {e}")

    def _save_prefs(self):
        try:
            prefs = {
                "input": self.input_entry.get(),
                "output": self.output_entry.get()
            }
            with open(self._get_prefs_path(), 'w') as f:
                json.dump(prefs, f)
        except Exception as e:
            print(f"Failed to save prefs: {e}")

    def _build_ui(self):
        # Header Area
        header = tk.Frame(self.root, bg=self.THEME["bg"], height=80)
        header.pack(fill="x", padx=30, pady=20)
        
        title_label = tk.Label(header, text="Gemini Watermark Remover", 
                               font=self.THEME["font_header"], fg=self.THEME["text"], bg=self.THEME["bg"])
        title_label.pack(side="left")
        
        status_dot = tk.Canvas(header, width=10, height=10, bg=self.THEME["bg"], highlightthickness=0)
        status_dot.create_oval(2, 2, 8, 8, fill=self.THEME["primary"])
        status_dot.pack(side="left", padx=10)
        
        # Content
        content = tk.Frame(self.root, bg=self.THEME["bg"])
        content.pack(fill="both", expand=True, padx=30)
        
        # Input/Output Cards
        self._create_path_section(content, "Input Source", "Select files or folder to process", "input")
        self._create_path_section(content, "Output Destination", "Where to save processed images", "output")
        
        # Options Bar
        options_bar = tk.Frame(content, bg=self.THEME["bg"])
        options_bar.pack(fill="x", pady=10)
        
        tk.Checkbutton(options_bar, text="Deep Scan (Highly Recommended)", variable=self.deep_scan_var,
                       bg=self.THEME["bg"], fg=self.THEME["text"], selectcolor=self.THEME["card"],
                       activebackground=self.THEME["bg"], activeforeground=self.THEME["primary"],
                       font=self.THEME["font_main"], borderwidth=0, highlightthickness=0).pack(side="left", padx=(0, 20))
        
        tk.Checkbutton(options_bar, text="Enforce Noise Reduction (Stable)", variable=self.noise_reduction_var,
                       bg=self.THEME["bg"], fg=self.THEME["text"], selectcolor=self.THEME["card"],
                       activebackground=self.THEME["bg"], activeforeground=self.THEME["primary"],
                       font=self.THEME["font_main"], borderwidth=0, highlightthickness=0).pack(side="left")

        # Action Bar
        action_bar = tk.Frame(content, bg=self.colors["bg"])
        action_bar.pack(fill="x", pady=15)
        
        self.process_btn = tk.Button(action_bar, text="START PROCESSING", command=self.start_task,
                                     bg=self.THEME["primary"], fg="white", font=self.THEME["font_bold"],
                                     padx=30, pady=10, relief="flat", cursor="hand2", activebackground="#059669")
        self.process_btn.pack(side="right")
        
        # Progress Bar
        style = ttk.Style()
        style.theme_use('default')
        style.configure("Emerald.Horizontal.TProgressbar", thickness=10, troughcolor=self.THEME["card"], 
                        background=self.THEME["primary"], borderwidth=0)
        
        self.progress = ttk.Progressbar(content, style="Emerald.Horizontal.TProgressbar", 
                                        orient="horizontal", mode="determinate")
        self.progress.pack(fill="x", pady=10)
        
        # Audit Log Console
        log_frame = tk.LabelFrame(content, text="AUDIT CONSOLE", bg=self.THEME["bg"], fg="#64748b",
                                  font=("Courier New", 10, "bold"), labelanchor="nw", borderwidth=1, relief="flat")
        log_frame.pack(fill="both", expand=True, pady=10)
        
        self.console = scrolledtext.ScrolledText(log_frame, bg="#020617", fg="#cbd5e1", 
                                                 font=("Consolas", 10), borderwidth=0, padx=10, pady=10)
        self.console.pack(fill="both", expand=True)

    def _create_path_section(self, parent, title, subtitle, mode):
        frame = tk.Frame(parent, bg=self.THEME["card"], padx=20, pady=15)
        frame.pack(fill="x", pady=5)
        
        lbl_frame = tk.Frame(frame, bg=self.THEME["card"])
        lbl_frame.pack(side="left")
        
        tk.Label(lbl_frame, text=title, font=self.THEME["font_bold"], fg=self.THEME["text"], bg=self.THEME["card"]).pack(anchor="w")
        tk.Label(lbl_frame, text=subtitle, font=self.THEME["font_main"], fg="#94a3b8", bg=self.THEME["card"]).pack(anchor="w")
        
        path_entry = tk.Entry(frame, bg="#0f172a", fg=self.THEME["text"], borderwidth=0, font=self.THEME["font_main"])
        path_entry.pack(side="left", fill="x", expand=True, padx=20)
        
        btn_frame = tk.Frame(frame, bg=self.THEME["card"])
        btn_frame.pack(side="right")
        
        tk.Button(btn_frame, text="BROWSE", command=lambda m=mode: self.browse_path(m), 
                  bg=self.THEME["accent"], fg="white", font=self.THEME["font_main"], 
                  relief="flat", padx=10).pack()
        
        if mode == "input": self.input_entry = path_entry
        else: self.output_entry = path_entry

    def log(self, msg, level="info"):
        if threading.current_thread() is not threading.main_thread():
            self.root.after(0, lambda: self.log(msg, level))
            return
        timestamp = datetime.now().strftime("%H:%M:%S")
        color = self.THEME["text"]
        if level == "success": color = self.THEME["primary"]
        if level == "warn": color = self.THEME["warn"]
        if level == "err": color = self.THEME["err"]
        if level == "process": color = self.THEME["accent"]
        
        self.console.tag_config(level, foreground=color)
        self.console.insert(tk.END, f"[{timestamp}] [{level.upper()}] {msg}\n", level)
        self.console.see(tk.END)

    def browse_path(self, mode):
        if mode == "input":
            path = filedialog.askopenfilenames(title="Select Images") if tk.messagebox.askyesno("Source Type", "Select multiple files? (No for Folder selection)") else filedialog.askdirectory(title="Select Input Folder")
        else:
            path = filedialog.askdirectory(title="Select Output Folder")
            
        if path:
            if mode == "input":
                self.input_paths = path
                display_path = str(path)
                entry = self.input_entry
            else:
                display_path = str(path)
                entry = self.output_entry
            
            entry.delete(0, tk.END)
            entry.insert(0, display_path)

    def start_task(self):
        input_p = self.input_entry.get()
        output_p = self.output_entry.get()
        
        if not input_p or not output_p:
            messagebox.showwarning("Missing Paths", "Please select both input and output paths.")
            return

        self._save_prefs()
            
        self.process_btn.config(state="disabled", text="PROCESSING...")
        self.progress["value"] = 0
        
        thread = threading.Thread(target=self.run_process, args=(input_p, output_p))
        thread.daemon = True
        thread.start()

    def run_process(self, src, dest):
        try:
            ds = self.deep_scan_var.get()
            nr = self.noise_reduction_var.get()
            self.log(f"Starting process [DS={ds}, NR={nr}]...", "process")
            
            # Synchronize: If the entry content doesn't match the multi-file cache, fallback to single path
            is_valid_multi = isinstance(self.input_paths, (list, tuple)) and str(self.input_paths) == src
            
            if is_valid_multi:
                total = len(self.input_paths)
                for i, f in enumerate(self.input_paths):
                    self.log(f"Processing ({i+1}/{total}): {os.path.basename(f)}", "info")
                    res = self.remover.remove_watermark(f, dest, deep_scan=ds, noise_reduction=nr)
                    self._handle_result(res)
                    val = ((i + 1) / total) * 100
                    self.root.after(0, lambda v=val: self.progress.configure(value=v))
            else:
                res = self.remover.remove_watermark(src, dest, deep_scan=ds, noise_reduction=nr)
                self._handle_result(res)
                self.root.after(0, lambda: self.progress.configure(value=100))
            
            self.log("All tasks completed successfully.", "success")
        except Exception as e:
            self.log(f"Fatal Error: {str(e)}", "err")
        finally:
            self.process_btn.config(state="normal", text="START PROCESSING")

    def _handle_result(self, results):
        for r in results:
            status = r.get("status")
            name = r.get("file", r.get("input", "unknown"))
            if status == "success":
                self.log(f"Success: {os.path.basename(name)}", "success")
            else:
                self.log(f"Failed: {os.path.basename(name)} - {r.get('message', 'Unknown error')}", "err")

if __name__ == "__main__":
    from tkinter import messagebox
    root = tk.Tk()
    # Attempt to use a cleaner theme if available
    app = ModernGUI(root)
    root.mainloop()
