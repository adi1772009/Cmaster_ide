/* Classic Recursion & Backtracking in C */
#include <stdio.h>
#include <stdbool.h>

// 1. Tower of Hanoi
void towerOfHanoi(int n, char from, char to, char aux) {
    if (n == 1) { printf("Move disk 1 from %c to %c\n", from, to); return; }
    towerOfHanoi(n - 1, from, aux, to);
    printf("Move disk %d from %c to %c\n", n, from, to);
    towerOfHanoi(n - 1, aux, to, from);
}

// 2. N-Queens Backtracking
#define N 4
bool isSafe(int board[N][N], int row, int col) {
    for (int i = 0; i < col; i++) if (board[row][i]) return false;
    for (int i = row, j = col; i >= 0 && j >= 0; i--, j--) if (board[i][j]) return false;
    for (int i = row, j = col; j >= 0 && i < N; i++, j--) if (board[i][j]) return false;
    return true;
}

bool solveNQUtil(int board[N][N], int col) {
    if (col >= N) return true;
    for (int i = 0; i < N; i++) {
        if (isSafe(board, i, col)) {
            board[i][col] = 1;
            if (solveNQUtil(board, col + 1)) return true;
            board[i][col] = 0;
        }
    }
    return false;
}
