# Slag slurry viscosity calculator

A static, browser-local tool for predicting intermediate apparent viscosity from measured endpoints of the same formulation. Open `index.html` through a static web host.

## Models and data
- Main calculator: two-endpoint power-law interpolation over the supplied water-to-powder interval.
- Optional physical candidate: K–D with corresponding phase properties and an externally supplied limiting-concentration parameter.
- Model identity and measured/literature/assumed provenance remain attached to validation and exported results.
- Input and imported records stay in the visitor browser. No private formulation workbook or historical measurement table is included.

## GitHub Pages
Publish the `main` branch from `/(root)` in repository Settings > Pages. All resource paths are relative, so a repository subpath is supported. The `.nojekyll` marker requests plain static-file serving.

## Scientific scope
The tool is a calculation and validation interface. Algebraic software checks are distinct from material experiments. Independent new-batch and physical-model validation require actual measurements.
