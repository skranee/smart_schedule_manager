export function sigmoid(z: number): number {
  if (z < -30) return 0;
  if (z > 30) return 1;
  return 1 / (1 + Math.exp(-z));
}

export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vector length mismatch');
  }
  return a.reduce((acc, value, index) => acc + value * b[index], 0);
}

export function addVectors(a: number[], b: number[]): number[] {
  if (a.length !== b.length) {
    throw new Error('Vector length mismatch');
  }
  return a.map((value, index) => value + b[index]);
}

export function scaleVector(vector: number[], factor: number): number[] {
  return vector.map((value) => value * factor);
}

