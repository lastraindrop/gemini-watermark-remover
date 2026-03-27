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
        self.root.title("Gemini Watermark Remover (Desktop) v1.2")
        self.root.geometry("900x650")
        self.root.configure(bg="#0f172a") # Dark Slate
        
        # Colors & Styles
        self.colors = {
            "bg": "#0f172a",
            "card": "#1e293b",
            "primary": "#10B981", # Emerald
            "text": "#f8fafc",
            "accent": "#4f46e5", # Indigo
            "warn": "#f59e0b",
            "err": "#ef4444"
        }
        
        try:
            self.remover = GeminiWatermarkRemover(os.path.abspath("./"))
        except Exception as e:
            self.log(f"Initialization Failed: {str(e)}", "err")
            self.remover = None

        self._build_ui()
        self.log("Desktop Interface initialized. Ready for processing.", "success")

    def _build_ui(self):
        # Header
        header = tk.Frame(self.root, bg=self.colors["bg"], height=80)
        header.pack(fill="x", padx=30, pady=20)
        
        title_label = tk.Label(header, text="Gemini Watermark Remover", 
                               font=("Inter", 24, "bold"), fg=self.colors["text"], bg=self.colors["bg"])
        title_label.pack(side="left")
        
        status_dot = tk.Canvas(header, width=10, height=10, bg=self.colors["bg"], highlightthickness=0)
        status_dot.create_oval(2, 2, 8, 8, fill=self.colors["primary"])
        status_dot.pack(side="left", padx=10)
        
        # Main Content
        content = tk.Frame(self.root, bg=self.colors["bg"])
        content.pack(fill="both", expand=True, padx=30)
        
        # Input/Output Cards
        self._create_path_section(content, "Input Source", "Select files or folder to process", "input")
        self._create_path_section(content, "Output Destination", "Where to save processed images", "output")
        
        # Action Bar
        action_bar = tk.Frame(content, bg=self.colors["bg"])
        action_bar.pack(fill="x", pady=20)
        
        self.process_btn = tk.Button(action_bar, text="START PROCESSING", command=self.start_task,
                                     bg=self.colors["primary"], fg="white", font=("Inter", 12, "bold"),
                                     padx=30, pady=10, relief="flat", cursor="hand2", activebackground="#059669")
        self.process_btn.pack(side="right")
        
        # Progress Bar
        style = ttk.Style()
        style.theme_use('default')
        style.configure("Emerald.Horizontal.TProgressbar", thickness=10, troughcolor=self.colors["card"], 
                        background=self.colors["primary"], borderwidth=0)
        
        self.progress = ttk.Progressbar(content, style="Emerald.Horizontal.TProgressbar", 
                                        orient="horizontal", mode="determinate")
        self.progress.pack(fill="x", pady=10)
        
        # Audit Log Console
        log_frame = tk.LabelFrame(content, text="AUDIT CONSOLE", bg=self.colors["bg"], fg="#64748b",
                                  font=("Courier New", 10, "bold"), labelanchor="nw", borderwidth=1, relief="flat")
        log_frame.pack(fill="both", expand=True, pady=10)
        
        self.console = scrolledtext.ScrolledText(log_frame, bg="#020617", fg="#cbd5e1", 
                                                 font=("Consolas", 10), borderwidth=0, padx=10, pady=10)
        self.console.pack(fill="both", expand=True)

    def _create_path_section(self, parent, title, subtitle, mode):
        frame = tk.Frame(parent, bg=self.colors["card"], padx=20, pady=15)
        frame.pack(fill="x", pady=5)
        
        lbl_frame = tk.Frame(frame, bg=self.colors["card"])
        lbl_frame.pack(side="left")
        
        tk.Label(lbl_frame, text=title, font=("Inter", 12, "bold"), fg=self.colors["text"], bg=self.colors["card"]).pack(anchor="w")
        tk.Label(lbl_frame, text=subtitle, font=("Inter", 9), fg="#94a3b8", bg=self.colors["card"]).pack(anchor="w")
        
        path_entry = tk.Entry(frame, bg="#0f172a", fg=self.colors["text"], borderwidth=0, font=("Inter", 10))
        path_entry.pack(side="left", fill="x", expand=True, padx=20)
        
        btn_frame = tk.Frame(frame, bg=self.colors["card"])
        btn_frame.pack(side="right")
        
        tk.Button(btn_frame, text="BROWSE", command=lambda m=mode: self.browse_path(m), 
                  bg=self.colors["accent"], fg="white", font=("Inter", 9, "bold"), 
                  relief="flat", padx=10).pack()
        
        if mode == "input": self.input_entry = path_entry
        else: self.output_entry = path_entry

    def log(self, msg, level="info"):
        if threading.current_thread() is not threading.main_thread():
            self.root.after(0, lambda: self.log(msg, level))
            return
        timestamp = datetime.now().strftime("%H:%M:%S")
        color = self.colors["text"]
        if level == "success": color = self.colors["primary"]
        if level == "warn": color = self.colors["warn"]
        if level == "err": color = self.colors["err"]
        if level == "process": color = self.colors["accent"]
        
        self.console.tag_config(level, foreground=color)
        self.console.insert(tk.END, f"[{timestamp}] [{level.upper()}] {msg}\n", level)
        self.console.see(tk.END)

    def browse_path(self, mode):
        if mode == "input":
            path = filedialog.askopenfilenames(title="Select Images") if tk.messagebox.askyesno("Source Type", "Select multiple files? (No for Folder selection)") else filedialog.askdirectory(title="Select Input Folder")
        else:
            path = filedialog.askdirectory(title="Select Output Folder")
            
        if path:
            entry = self.input_entry if mode == "input" else self.output_entry
            entry.delete(0, tk.END)
            entry.insert(0, str(path))

    def start_task(self):
        src = self.input_entry.get()
        dest = self.output_entry.get()
        
        if not src or not dest:
            self.log("Please specify both input and output paths.", "warn")
            return
            
        self.process_btn.config(state="disabled", text="PROCESSING...")
        self.progress["value"] = 0
        
        thread = threading.Thread(target=self.run_process, args=(src, dest))
        thread.daemon = True
        thread.start()

    def run_process(self, src, dest):
        try:
            self.log(f"Starting batch process...", "process")
            # Handle list of files vs directory
            if "(" in src and ")" in src: # It's a tuple from askopenfilenames
                # Simple logic for this demo: process one by one
                import ast
                src_list = ast.literal_eval(src)
                total = len(src_list)
                for i, f in enumerate(src_list):
                    self.log(f"Processing ({i+1}/{total}): {os.path.basename(f)}", "info")
                    res = self.remover.remove_watermark(f, dest)
                    self._handle_result(res)
                    # Update progress bar safely
                    val = ((i + 1) / total) * 100
                    self.root.after(0, lambda v=val: self.progress.configure(value=v))
            else:
                res = self.remover.remove_watermark(src, dest)
                self._handle_result(res)
                self.progress["value"] = 100
            
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
