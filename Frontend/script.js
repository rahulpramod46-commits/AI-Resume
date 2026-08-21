// ======================================
// NeuroCV - Resume Optimizer Flow
// Homepage + Upload + Scan + Result
// ======================================

const glow = document.createElement("div");
glow.className = "mouse-glow";
document.body.appendChild(glow);

window.addEventListener("mousemove", (e) => {
    glow.style.left = e.clientX + "px";
    glow.style.top = e.clientY + "px";
});

const canvas = document.getElementById("particles");

if (canvas) {
    const ctx = canvas.getContext("2d");

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    resize();
    window.addEventListener("resize", resize);

    const particles = [];

    for (let i = 0; i < 80; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: Math.random() * 2 + 1,
            dx: (Math.random() - 0.5) * 0.4,
            dy: (Math.random() - 0.5) * 0.4
        });
    }
    // ---------- Typing Effect ----------
    const typingElement = document.getElementById("typing-text");

    if (typingElement) {
        const text = "Scanning resume... Detecting skills... Calculating ATS score... Optimizing keywords...";
        let i = 0;


        function typeEffect() {
            if (i < text.length) {
                typingElement.innerHTML += text.charAt(i);
                i++;
                setTimeout(typeEffect, 40);
            } else {
                setTimeout(() => {
                    typingElement.innerHTML = "";
                    i = 0;
                    typeEffect();
                }, 1500);
            }
        }

        typeEffect();


    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            p.x += p.dx;
            p.y += p.dy;

            if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
            if (p.y < 0 || p.y > canvas.height) p.dy *= -1;

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(96,165,250,0.7)";
            ctx.fill();

            for (let j = i + 1; j < particles.length; j++) {
                const q = particles[j];
                const dist = Math.hypot(p.x - q.x, p.y - q.y);

                if (dist < 120) {
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(q.x, q.y);
                    ctx.strokeStyle = `rgba(96, 165, 250, ${1 - dist / 120})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }

        requestAnimationFrame(animate);
    }

    animate();
}

document.querySelectorAll("a[href^='#']").forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute("href"));
        if (target) {
            target.scrollIntoView({ behavior: "smooth" });
        }
    });
});

const resumeInput = document.getElementById("resumeFile");

if (resumeInput) {
    resumeInput.addEventListener("change", () => {
        const status = document.getElementById("status");
        if (resumeInput.files.length > 0) {
            status.innerText = "Selected: " + resumeInput.files[0].name;
        }
    });
}

async function uploadResume() {
    const fileInput = document.getElementById("resumeFile");
    const status = document.getElementById("status");

    if (!fileInput || fileInput.files.length === 0) {
        status.innerText = "Please select a resume file first.";
        return;
    }

    const formData = new FormData();
    formData.append("resume", fileInput.files[0]);

    status.innerText = "Uploading resume...";

    try {
        const response = await fetch("http://localhost:5000/upload", {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            localStorage.setItem("improvedResume", JSON.stringify(data.improvedResume));
            localStorage.setItem("originalResume", data.originalResume);
            localStorage.setItem("pdfUrl", data.pdfUrl || "");
            localStorage.setItem("resumeFileName", data.fileName || "resume.pdf");

            status.innerText = "Upload successful! Opening AI Scanner...";
            setTimeout(() => {
                window.location.href = "./scan.html";
            }, 200);
        } else {
            status.innerText = "Upload failed: " + data.message;
        }
    } catch (error) {
        console.error(error);
        status.innerText = "Cannot connect to backend server.";
    }
}

const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");

if (progressBar && progressText) {
    const steps = [
        "Initializing AI Engine...",
        "Reading Resume Document...",
        "Extracting Skills...",
        "Detecting Keywords...",
        "Optimizing Resume Structure...",
        "Generating ATS-Friendly Summary...",
        "Finalizing Improved Resume..."
    ];

    let index = 0;
    progressText.innerText = steps[0];
    progressBar.style.width = "5%";

    const interval = setInterval(() => {
        index++;

        if (index < steps.length) {
            progressText.innerText = steps[index];
            progressBar.style.width = ((index + 1) / steps.length) * 100 + "%";
        } else {
            clearInterval(interval);
            progressText.innerText = "Analysis Complete! Redirecting...";
            setTimeout(() => {
                window.location.href = "result.html";
            }, 1200);
        }
    }, 1000);
}

function renderResumePreview() {
    const preview = document.getElementById("resumePreview");
    if (!preview) return;

    const resumeText = localStorage.getItem("improvedResume");

    if (!resumeText) {
        preview.innerHTML = `
            <div class="preview-empty">
                No improved resume available yet.
            </div>
        `;
        return;
    }

    // Convert AI resume text into a professional HTML resume
    let html = resumeText
        .replace(/\r\n/g, "\n")
        .replace(/\n{2,}/g, "\n\n");

    // Convert section headings into dark professional headings
    const sections = [
        "Professional Summary",
        "Objective",
        "Technical Skills",
        "Skills",
        "Education",
        "Projects",
        "Experience",
        "Certifications",
        "Achievements",
        "Interests",
        "Languages"
    ];

    sections.forEach(section => {
        const regex = new RegExp(section + ":?", "gi");
        html = html.replace(regex, `<h2>${section}</h2>`);
    });

    // Convert bullet points
    html = html.replace(/^- (.*)$/gm, "<li>$1</li>");
    html = html.replace(/^• (.*)$/gm, "<li>$1</li>");
    html = html.replace(/<li>([\s\S]*?)(<\/li>(?!\s*<li>))/g, "<ul><li>$1</li></ul>");

    // Convert remaining line breaks into paragraphs
    html = html
        .split("\n\n")
        .map(block => {
            if (block.trim().startsWith("<h2>") || block.trim().startsWith("<ul>")) {
                return block;
            }
            return `<p>${block.replace(/\n/g, "<br>")}</p>`;
        })
        .join("");

    preview.innerHTML = `
        <div class="resume-paper">
            ${html}
        </div>
    `;
}

function downloadResumePDF() {
    const pdfUrl = localStorage.getItem("pdfUrl");
    if (!pdfUrl) {
        alert("No PDF is available yet.");
        return;
    }

    const link = document.createElement("a");
    link.href = `http://localhost:5000${pdfUrl}`;
    link.download = "improved-resume.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

if (document.getElementById("resumePreview")) {
    renderResumePreview();
}

window.downloadResumePDF = downloadResumePDF;
const demoModal = document.getElementById("demoModal");
const watchBtn = document.getElementById("watchDemoBtn");
const closeBtn = document.getElementById("closeDemoBtn");

if (watchBtn && demoModal) {
    watchBtn.addEventListener("click", () => {
        demoModal.classList.add("show");
        startDemo();
    });
}

if (closeBtn) {
    closeBtn.addEventListener("click", () => {
        demoModal.classList.remove("show");
    });
}

function startDemo() {
    const steps = document.querySelectorAll(".demo-step");
    const bar = document.querySelector(".demo-progress-bar");

    if (!steps.length || !bar) return;

    steps.forEach(s => s.classList.remove("active"));
    let index = 0;
    steps[index].classList.add("active");
    bar.style.width = "20%";

    const interval = setInterval(() => {
        steps[index].classList.remove("active");
        index++;

        if (index < steps.length) {
            steps[index].classList.add("active");
            bar.style.width = ((index + 1) / steps.length) * 100 + "%";
        } else {
            clearInterval(interval);
            setTimeout(() => demoModal.classList.remove("show"), 1500);
        }
    }, 1200);
}