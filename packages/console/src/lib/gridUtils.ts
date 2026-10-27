/**
 * Snaps a value to the nearest grid point
 * @param value - The value to snap
 * @param gridSize - The grid size (default 20px)
 * @returns The snapped value
 */
export const snapToGrid = (value: number, gridSize: number = 20): number => {
    return Math.round(value / gridSize) * gridSize;
};

/**
 * Snaps coordinates to grid
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param gridSize - Grid size
 * @returns Snapped coordinates
 */
export const snapCoordinatesToGrid = (
    x: number,
    y: number,
    gridSize: number = 20
): { x: number; y: number } => {
    return {
        x: snapToGrid(x, gridSize),
        y: snapToGrid(y, gridSize)
    };
};

/**
 * Snaps dimensions to grid
 * @param width - Width
 * @param height - Height  
 * @param gridSize - Grid size
 * @returns Snapped dimensions
 */
export const snapDimensionsToGrid = (
    width: number,
    height: number,
    gridSize: number = 20
): { width: number; height: number } => {
    return {
        width: Math.max(gridSize, snapToGrid(width, gridSize)),
        height: Math.max(gridSize, snapToGrid(height, gridSize))
    };
};
