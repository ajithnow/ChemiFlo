/** Partial-pivot elimination. Free temperatures retain their supplied reference. */
export function solveTemperatures(coefficients: number[][], constants: number[], references: number[]) {
  const size = constants.length;
  const rows = coefficients.map((row, i) => [...row, constants[i]]);
  const pivots: number[] = [];
  const tolerance = 1e-12;
  for (let col = 0; col < size; col++) {
    const rank = pivots.length;
    let best = rank;
    for (let row = rank + 1; row < size; row++) {
      if (Math.abs(rows[row][col]) > Math.abs(rows[best][col])) best = row;
    }
    if (Math.abs(rows[best][col]) <= tolerance) continue;
    [rows[rank], rows[best]] = [rows[best], rows[rank]];
    const pivot = rows[rank][col];
    for (let j = col; j <= size; j++) rows[rank][j] /= pivot;
    for (let row = rank + 1; row < size; row++) {
      const factor = rows[row][col];
      for (let j = col; j <= size; j++) rows[row][j] -= factor * rows[rank][j];
    }
    pivots.push(col);
  }
  const constantScale = 1 + Math.max(0, ...constants.map(Math.abs));
  if (rows.slice(pivots.length).some(row => Math.abs(row[size]) > 1e-10 * constantScale)) return null;
  const result = [...references];
  for (let row = pivots.length - 1; row >= 0; row--) {
    const col = pivots[row];
    let temperature = rows[row][size];
    for (let j = col + 1; j < size; j++) temperature -= rows[row][j] * result[j];
    result[col] = temperature;
  }
  // Check the original equations, including redundant rows: a powered insulated
  // loop has an inconsistent energy balance, not a finite steady temperature.
  const valid = result.every(Number.isFinite) && coefficients.every((row, i) => {
    const terms = row.map((coefficient, j) => coefficient * result[j]);
    const residual = terms.reduce((sum, term) => sum + term, 0) - constants[i];
    const scale = 1 + Math.abs(constants[i]) + terms.reduce((sum, term) => sum + Math.abs(term), 0);
    return Math.abs(residual) <= 1e-10 * scale;
  });
  if (!valid) return null;
  return result;
}
