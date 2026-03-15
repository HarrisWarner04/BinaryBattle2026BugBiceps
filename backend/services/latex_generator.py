"""
LaTeX resume generator using Jake's Resume template structure.
Converts parsed resume JSON into a clean professional LaTeX document.
Also generates an ATS-friendly plain text version.
"""

from fastapi import HTTPException


def _escape_latex(text: str) -> str:
    """Escape special LaTeX characters in text."""
    if not text:
        return ""
    replacements = {
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    for char, replacement in replacements.items():
        text = text.replace(char, replacement)
    return text


def generate_latex(parsed_data: dict) -> str:
    """
    Convert parsed resume JSON into a complete LaTeX document using Jake's Resume template.
    The LaTeX is ATS-friendly: no columns, no tables for layout, no graphics, purely linear text.

    Args:
        parsed_data: Dictionary from resume_parser containing all resume sections.

    Returns:
        Complete LaTeX string ready for compilation.

    Raises:
        HTTPException: If LaTeX generation fails.
    """
    try:
        personal = parsed_data.get("personal", {})
        summary = parsed_data.get("summary", "")
        education = parsed_data.get("education", [])
        experience = parsed_data.get("experience", [])
        projects = parsed_data.get("projects", [])
        skills = parsed_data.get("skills", {})
        certifications = parsed_data.get("certifications", [])
        achievements = parsed_data.get("achievements", [])

        latex_parts = []

        # Document preamble - Jake's Resume style
        latex_parts.append(r"""\documentclass[letterpaper,11pt]{article}

\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}

\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.5in}
\addtolength{\textheight}{1.0in}

\urlstyle{same}

\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

\titleformat{\section}{
  \vspace{-4pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]

\newcommand{\resumeItem}[1]{
  \item\small{#1 \vspace{-2pt}}
}

\newcommand{\resumeSubheading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & #2 \\
      \textit{\small#3} & \textit{\small #4} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeProjectHeading}[2]{
    \item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
      \small#1 & #2 \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeSubItem}[1]{\resumeItem{#1}\vspace{-4pt}}

\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}

\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}

\begin{document}
""")

        # Header - personal info
        name = _escape_latex(personal.get("name", "Your Name"))
        header_items = []
        if personal.get("phone"):
            header_items.append(_escape_latex(personal["phone"]))
        if personal.get("email"):
            header_items.append(r"\href{mailto:" + personal["email"] + "}{" + _escape_latex(personal["email"]) + "}")
        if personal.get("linkedin"):
            linkedin = personal["linkedin"]
            if not linkedin.startswith("http"):
                linkedin = "https://" + linkedin
            header_items.append(r"\href{" + linkedin + "}{LinkedIn}")
        if personal.get("github"):
            github = personal["github"]
            if not github.startswith("http"):
                github = "https://" + github
            header_items.append(r"\href{" + github + "}{GitHub}")
        if personal.get("location"):
            header_items.append(_escape_latex(personal["location"]))

        latex_parts.append(r"\begin{center}")
        latex_parts.append(r"    \textbf{\Huge \scshape " + name + r"} \\ \vspace{1pt}")
        if header_items:
            latex_parts.append(r"    \small " + r" $|$ ".join(header_items))
        latex_parts.append(r"\end{center}")

        # Summary
        if summary:
            latex_parts.append(r"\section{Summary}")
            latex_parts.append(_escape_latex(summary))

        # Education
        if education:
            latex_parts.append(r"\section{Education}")
            latex_parts.append(r"\resumeSubHeadingListStart")
            for edu in education:
                degree = _escape_latex(edu.get("degree", ""))
                institution = _escape_latex(edu.get("institution", ""))
                year = _escape_latex(edu.get("year", ""))
                cgpa = _escape_latex(edu.get("cgpa_or_percentage", ""))
                cgpa_str = f"CGPA/Percentage: {cgpa}" if cgpa else ""
                latex_parts.append(r"    \resumeSubheading")
                latex_parts.append(r"      {" + institution + "}{" + year + "}")
                latex_parts.append(r"      {" + degree + "}{" + cgpa_str + "}")
                courses = edu.get("relevant_courses", [])
                if courses:
                    latex_parts.append(r"      \resumeItemListStart")
                    latex_parts.append(r"        \resumeItem{Relevant Courses: " + _escape_latex(", ".join(courses)) + "}")
                    latex_parts.append(r"      \resumeItemListEnd")
            latex_parts.append(r"\resumeSubHeadingListEnd")

        # Experience
        if experience:
            latex_parts.append(r"\section{Experience}")
            latex_parts.append(r"\resumeSubHeadingListStart")
            for exp in experience:
                title = _escape_latex(exp.get("title", ""))
                company = _escape_latex(exp.get("company", ""))
                duration = _escape_latex(exp.get("duration", ""))
                latex_parts.append(r"    \resumeSubheading")
                latex_parts.append(r"      {" + title + "}{" + duration + "}")
                latex_parts.append(r"      {" + company + "}{}")
                responsibilities = exp.get("responsibilities", [])
                if responsibilities:
                    latex_parts.append(r"      \resumeItemListStart")
                    for resp in responsibilities:
                        latex_parts.append(r"        \resumeItem{" + _escape_latex(resp) + "}")
                    latex_parts.append(r"      \resumeItemListEnd")
            latex_parts.append(r"\resumeSubHeadingListEnd")

        # Projects
        if projects:
            latex_parts.append(r"\section{Projects}")
            latex_parts.append(r"\resumeSubHeadingListStart")
            for proj in projects:
                proj_name = _escape_latex(proj.get("name", ""))
                techs = proj.get("technologies", [])
                tech_str = ", ".join([_escape_latex(t) for t in techs]) if techs else ""
                proj_heading = r"\textbf{" + proj_name + "}"
                if tech_str:
                    proj_heading += r" $|$ \emph{" + tech_str + "}"
                github_link = proj.get("github_link", "")
                link_str = ""
                if github_link:
                    if not github_link.startswith("http"):
                        github_link = "https://" + github_link
                    link_str = r"\href{" + github_link + "}{GitHub}"
                latex_parts.append(r"    \resumeProjectHeading")
                latex_parts.append(r"      {" + proj_heading + "}{" + link_str + "}")
                items = []
                if proj.get("description"):
                    items.append(proj["description"])
                if proj.get("impact"):
                    items.append("Impact: " + proj["impact"])
                if items:
                    latex_parts.append(r"      \resumeItemListStart")
                    for item in items:
                        latex_parts.append(r"        \resumeItem{" + _escape_latex(item) + "}")
                    latex_parts.append(r"      \resumeItemListEnd")
            latex_parts.append(r"\resumeSubHeadingListEnd")

        # Skills
        has_skills = any([
            skills.get("technical"), skills.get("tools"),
            skills.get("soft_skills"), skills.get("languages")
        ])
        if has_skills:
            latex_parts.append(r"\section{Technical Skills}")
            latex_parts.append(r"\begin{itemize}[leftmargin=0.15in, label={}]")
            latex_parts.append(r"  \small{\item{")
            skill_lines = []
            if skills.get("technical"):
                skill_lines.append(r"    \textbf{Technical Skills}{: " + _escape_latex(", ".join(skills["technical"])) + r"} \\")
            if skills.get("tools"):
                skill_lines.append(r"    \textbf{Tools \& Technologies}{: " + _escape_latex(", ".join(skills["tools"])) + r"} \\")
            if skills.get("languages"):
                skill_lines.append(r"    \textbf{Languages}{: " + _escape_latex(", ".join(skills["languages"])) + r"} \\")
            if skills.get("soft_skills"):
                skill_lines.append(r"    \textbf{Soft Skills}{: " + _escape_latex(", ".join(skills["soft_skills"])) + r"}")
            latex_parts.append("\n".join(skill_lines))
            latex_parts.append(r"  }}")
            latex_parts.append(r"\end{itemize}")

        # Certifications
        if certifications:
            latex_parts.append(r"\section{Certifications}")
            latex_parts.append(r"\resumeSubHeadingListStart")
            for cert in certifications:
                cert_name = _escape_latex(cert.get("name", ""))
                issuer = _escape_latex(cert.get("issuer", ""))
                year = _escape_latex(cert.get("year", ""))
                latex_parts.append(r"    \resumeProjectHeading")
                latex_parts.append(r"      {\textbf{" + cert_name + "} -- " + issuer + "}{" + year + "}")
            latex_parts.append(r"\resumeSubHeadingListEnd")

        # Achievements
        if achievements:
            latex_parts.append(r"\section{Achievements}")
            latex_parts.append(r"\resumeSubHeadingListStart")
            for ach in achievements:
                latex_parts.append(r"  \resumeItem{" + _escape_latex(ach) + "}")
            latex_parts.append(r"\resumeSubHeadingListEnd")

        # End document
        latex_parts.append(r"\end{document}")

        return "\n".join(latex_parts)

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"LaTeX generation failed: {str(e)}"
        )


def generate_plain_text(parsed_data: dict) -> str:
    """
    Generate an ATS-friendly plain text version of the resume.
    No formatting, no LaTeX commands - purely linear text for ATS simulation.

    Args:
        parsed_data: Dictionary from resume_parser.

    Returns:
        Plain text resume string.
    """
    parts = []
    personal = parsed_data.get("personal", {})

    # Header
    if personal.get("name"):
        parts.append(personal["name"])
    contact_items = []
    for key in ["email", "phone", "location", "linkedin", "github"]:
        if personal.get(key):
            contact_items.append(personal[key])
    if contact_items:
        parts.append(" | ".join(contact_items))
    parts.append("")

    # Summary
    summary = parsed_data.get("summary", "")
    if summary:
        parts.append("SUMMARY")
        parts.append(summary)
        parts.append("")

    # Education
    education = parsed_data.get("education", [])
    if education:
        parts.append("EDUCATION")
        for edu in education:
            line = ""
            if edu.get("degree"):
                line += edu["degree"]
            if edu.get("institution"):
                line += f" - {edu['institution']}"
            if edu.get("year"):
                line += f" ({edu['year']})"
            parts.append(line)
            if edu.get("cgpa_or_percentage"):
                parts.append(f"  CGPA/Percentage: {edu['cgpa_or_percentage']}")
            if edu.get("relevant_courses"):
                parts.append(f"  Relevant Courses: {', '.join(edu['relevant_courses'])}")
        parts.append("")

    # Experience
    experience = parsed_data.get("experience", [])
    if experience:
        parts.append("EXPERIENCE")
        for exp in experience:
            line = ""
            if exp.get("title"):
                line += exp["title"]
            if exp.get("company"):
                line += f" at {exp['company']}"
            if exp.get("duration"):
                line += f" ({exp['duration']})"
            parts.append(line)
            for resp in exp.get("responsibilities", []):
                parts.append(f"  - {resp}")
            if exp.get("technologies_used"):
                parts.append(f"  Technologies: {', '.join(exp['technologies_used'])}")
        parts.append("")

    # Projects
    proj_list = parsed_data.get("projects", [])
    if proj_list:
        parts.append("PROJECTS")
        for proj in proj_list:
            line = proj.get("name", "")
            if proj.get("technologies"):
                line += f" ({', '.join(proj['technologies'])})"
            parts.append(line)
            if proj.get("description"):
                parts.append(f"  {proj['description']}")
            if proj.get("impact"):
                parts.append(f"  Impact: {proj['impact']}")
        parts.append("")

    # Skills
    skills = parsed_data.get("skills", {})
    skill_sections = []
    if skills.get("technical"):
        skill_sections.append(f"Technical: {', '.join(skills['technical'])}")
    if skills.get("tools"):
        skill_sections.append(f"Tools: {', '.join(skills['tools'])}")
    if skills.get("languages"):
        skill_sections.append(f"Languages: {', '.join(skills['languages'])}")
    if skills.get("soft_skills"):
        skill_sections.append(f"Soft Skills: {', '.join(skills['soft_skills'])}")
    if skill_sections:
        parts.append("SKILLS")
        for s in skill_sections:
            parts.append(f"  {s}")
        parts.append("")

    # Certifications
    certs = parsed_data.get("certifications", [])
    if certs:
        parts.append("CERTIFICATIONS")
        for cert in certs:
            line = cert.get("name", "")
            if cert.get("issuer"):
                line += f" - {cert['issuer']}"
            if cert.get("year"):
                line += f" ({cert['year']})"
            parts.append(f"  {line}")
        parts.append("")

    # Achievements
    achievements = parsed_data.get("achievements", [])
    if achievements:
        parts.append("ACHIEVEMENTS")
        for ach in achievements:
            parts.append(f"  - {ach}")
        parts.append("")

    return "\n".join(parts)
