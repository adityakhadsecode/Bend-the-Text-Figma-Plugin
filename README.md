# Bend the Text — Figma Plugin

> A powerful, non-destructive Figma plugin to curve, bend, and wrap typography into smooth arches, custom curves, and full 360° circular badges directly inside Figma.

---

## ⚡ Quick Start: Load into Figma in 30 Seconds (Zero-Build)

You do **not** need to install npm packages or run a build step to use this plugin immediately. It is packaged with pre-compiled, standalone production code ready for Figma.

### How to Install:
1. Open the **Figma Desktop App** (or Figma Web with the desktop agent running).
2. In any design file, open the top-left Figma menu:
   - Go to **Plugins** > **Development** > **Import plugin from manifest...**
3. Browse to this directory and select [`manifest.json`](manifest.json).
4. Click **Open**.
5. That's it! **Bend the Text** is now installed under your development plugins.

### How to Use:
1. Select any **Text Layer** on your Figma canvas.
2. Run the plugin:
   - Press <kbd>Cmd</kbd> + <kbd>/</kbd> (Mac) or <kbd>Ctrl</kbd> + <kbd>/</kbd> (Windows) and type `Bend the Text`, or right-click the canvas and choose **Plugins** > **Development** > **Bend the Text**.
3. Adjust the **Bend Strength** slider (-100% to +100%) to curve your type up, down, or into a circular badge.
4. Tweak kerning, baseline alignment, or flip direction if desired.
5. Click **Apply Bend**!

---

## 🚀 Key Features

* **Dynamic Curvature Control:** Bend linear text upwards into a rainbow/arch dome, downwards into a smile/bowl curve, or wrap it completely into a 360° circular badge.
* **Side-by-Side Non-Destructive Workflow:** Places the newly created curved group directly **beside** your selected textbox (or below/in-place if selected), keeping your original text layer 100% visible and untouched.
* **100% Font & Style Inheritance:** Clones every typographic and visual property:
  * Exact font family, weight, and styles (including mixed fonts per character).
  * Exact font sizes (including mixed sizes).
  * Exact fills (solid colors, linear/radial gradients, multi-fill stacks).
  * Exact strokes, stroke weights, alignments (`INSIDE`, `CENTER`, `OUTSIDE`), caps, joins, and dash patterns.
  * Exact effects (drop shadows, inner shadows, blurs).
  * Exact text casing, text decoration (underline/strikethrough), opacity, and blend modes.
* **Dual Output Modes:**
  * **Editable Text Layers:** Leaves individual characters as standard Figma `TextNode`s, retaining fonts, weights, fills, strokes, and letter styling.
  * **Vector Outlines:** Flattens the curved text into crisp vector paths ready for SVG exports, icons, and logos without missing font warnings.
* **Typographic Kerning Compensation:** Fine-tune character spacing (-15px to +35px) to prevent overlapping in tight circular curves.
* **Baseline Alignment Options:** Choose whether the curve anchors to the typographic **Baseline**, **Center**, **Top** (ascender), or **Bottom** (descender).
* **Live In-Modal SVG Preview:** Smooth SVG preview box showing the curved type and dashed radius guide in real time.
* **Canvas Live Preview:** Updates directly on the Figma artboard as you drag the slider.
* **Figma Native Theme:** Fully supports Figma Light Mode and Dark Mode automatically.

---

## 📐 Mathematical Formulation

### 1. Arc Angle & Circle Radius
Given:
* Text baseline length $W = \sum w_i + (N-1) \cdot \text{tracking}$
* Bend strength $b \in [-1.0, 1.0]$ where $\pm 1.0$ represents a complete circle ($360^\circ$ or $2\pi$ radians)

The central arc angle $\Theta$ is:
$$\Theta = b \cdot 2\pi$$

The circle radius $R$ is derived from the circular arc definition ($W = R \cdot |\Theta|$):
$$R = \frac{W}{|\Theta|} = \frac{W}{|b| \cdot 2\pi}$$

As $b \to 0$, $R \to \infty$, which represents flat, unbent text.

### 2. Character Position Along Curve
For each character $i$ at distance $\Delta_i \in [-\frac{W}{2}, \frac{W}{2}]$ from the text midpoint:
$$\alpha_i = \frac{\Delta_i}{R}$$

The Cartesian coordinates $(x_i, y_i)$ on the curve (with center $(C_x, C_y)$) are:
* **Upward Arch ($b > 0$, center below apex):**
  $$x_i = C_x + R \sin(\alpha_i)$$
  $$y_i = C_y - R \cos(\alpha_i)$$
  $$\text{Rotation } \phi_i = \alpha_i$$
* **Downward Smile ($b < 0$, center above trough):**
  $$x_i = C_x + R \sin(\alpha_i)$$
  $$y_i = C_y + R \cos(\alpha_i)$$
  $$\text{Rotation } \phi_i = -\alpha_i$$

### 3. Affine Matrix & Anchor Point Compensation
In Figma, a node's local origin $(0, 0)$ is its top-left corner. To rotate a glyph around its baseline center $(a_x, a_y)$:
$$\begin{pmatrix} t_x \\ t_y \end{pmatrix} = \begin{pmatrix} x_i \\ y_i \end{pmatrix} - \begin{pmatrix} \cos \phi & -\sin \phi \\ \sin \phi & \cos \phi \end{pmatrix} \begin{pmatrix} a_x \\ a_y \end{pmatrix}$$

The final 2×3 relative transform matrix applied to each character is:
$$\mathbf{M} = \begin{bmatrix} \cos \phi & -\sin \phi & t_x \\ \sin \phi & \cos \phi & t_y \end{bmatrix}$$

---

## 🛠️ Project Structure

```
├── manifest.json       # Figma plugin manifest descriptor
├── code.js             # Standalone production runtime for Figma
├── ui.html             # Standalone responsive UI with live SVG preview
├── package.json        # Node configuration & dependencies
├── tsconfig.json       # TypeScript compiler settings
├── src/
│   ├── code.ts         # TypeScript backend logic
│   └── ui.html         # HTML/CSS/JS frontend interface
└── README.md           # Documentation
```

---

## 💻 Development & Building from TypeScript

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run build

# Watch mode for active development
npm run watch
```

---

## 📄 License

MIT License. Free to use and customize for personal and commercial projects.
