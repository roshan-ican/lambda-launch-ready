let isCold = true;

export function consumeColdStart(): boolean {
    const wasCold = isCold
    isCold = false
    return wasCold
}