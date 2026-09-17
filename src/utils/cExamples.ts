export type CExample = {
  id: string
  title: string
  category: 'Recursion' | 'Data Structures' | 'Algorithms'
  description: string
  defaultStdin: string
  code: string
}

export const C_EXAMPLES: CExample[] = [
  {
    id: 'tower-of-hanoi',
    title: 'Tower of Hanoi (Recursion)',
    category: 'Recursion',
    description: 'Classic recursive puzzle moving N disks from rod A to rod C using auxiliary rod B.',
    defaultStdin: '3',
    code: `#include <stdio.h>

// Recursive Tower of Hanoi
void towerOfHanoi(int n, char from_rod, char to_rod, char aux_rod, int *stepCount) {
    if (n == 0) {
        return;
    }
    // Move n-1 disks from from_rod to aux_rod
    towerOfHanoi(n - 1, from_rod, aux_rod, to_rod, stepCount);
    
    (*stepCount)++;
    printf("Step %2d: Move disk %d from Rod %c -> Rod %c\\n", *stepCount, n, from_rod, to_rod);
    
    // Move n-1 disks from aux_rod to to_rod
    towerOfHanoi(n - 1, aux_rod, to_rod, from_rod, stepCount);
}

int main() {
    int n;
    printf("=== Tower of Hanoi (Recursion Engine) ===\\n");
    printf("Enter number of disks (e.g. 3): ");
    if (scanf("%d", &n) != 1 || n <= 0) {
        n = 3;
        printf("3 (default)\\n");
    }
    
    int steps = 0;
    printf("\\nSolution for %d disks:\\n", n);
    towerOfHanoi(n, 'A', 'C', 'B', &steps);
    printf("\\nTotal moves required: %d\\n", steps);
    return 0;
}
`,
  },
  {
    id: 'quicksort-recursive',
    title: 'QuickSort (Recursive Divide & Conquer)',
    category: 'Algorithms',
    description: 'Efficient recursive sorting algorithm using partition and recursion.',
    defaultStdin: '8\n64 25 12 22 11 90 45 33',
    code: `#include <stdio.h>

// Swap two integers
void swap(int *a, int *b) {
    int temp = *a;
    *a = *b;
    *b = temp;
}

// Partition function
int partition(int arr[], int low, int high) {
    int pivot = arr[high];
    int i = (low - 1);

    for (int j = low; j < high; j++) {
        if (arr[j] < pivot) {
            i++;
            swap(&arr[i], &arr[j]);
        }
    }
    swap(&arr[i + 1], &arr[high]);
    return (i + 1);
}

// Recursive QuickSort
void quickSort(int arr[], int low, int high, int depth) {
    if (low < high) {
        int pi = partition(arr, low, high);
        
        printf("[Depth %d] Pivot %d placed at index %d\\n", depth, arr[pi], pi);
        
        // Recursively sort left and right partitions
        quickSort(arr, low, pi - 1, depth + 1);
        quickSort(arr, pi + 1, high, depth + 1);
    }
}

void printArray(int arr[], int size) {
    for (int i = 0; i < size; i++) {
        printf("%d ", arr[i]);
    }
    printf("\\n");
}

int main() {
    printf("=== Recursive QuickSort Algorithm ===\\n");
    int arr[] = {64, 25, 12, 22, 11, 90, 45, 33};
    int n = sizeof(arr) / sizeof(arr[0]);

    printf("Original array: ");
    printArray(arr, n);
    printf("\\nSorting trace:\\n");

    quickSort(arr, 0, n - 1, 1);

    printf("\\nSorted array:   ");
    printArray(arr, n);
    return 0;
}
`,
  },
  {
    id: 'fibonacci-recursion',
    title: 'Fibonacci with Call Depth Trace (Recursion)',
    category: 'Recursion',
    description: 'Demonstrates call depth and recursive branching for Fibonacci numbers.',
    defaultStdin: '6',
    code: `#include <stdio.h>

// Print indentation for recursion visualizer
void printIndent(int depth) {
    for (int i = 0; i < depth; i++) {
        printf("  | ");
    }
}

// Recursive Fibonacci with execution trace
int fibonacci(int n, int depth, int *totalCalls) {
    (*totalCalls)++;
    printIndent(depth);
    printf("-> fib(%d)\\n", n);

    if (n <= 0) return 0;
    if (n == 1) return 1;

    int a = fibonacci(n - 1, depth + 1, totalCalls);
    int b = fibonacci(n - 2, depth + 1, totalCalls);
    int result = a + b;

    printIndent(depth);
    printf("<- fib(%d) = %d\\n", n, result);
    return result;
}

int main() {
    printf("=== Fibonacci Recursion Tree Visualizer ===\\n");
    int n;
    printf("Enter n (e.g. 5 or 6): ");
    if (scanf("%d", &n) != 1 || n < 0) {
        n = 5;
        printf("5 (default)\\n");
    }

    int totalCalls = 0;
    printf("\\nRecursion Call Tree:\\n");
    int result = fibonacci(n, 0, &totalCalls);

    printf("\\n-------------------------------------\\n");
    printf("Result: fib(%d) = %d\\n", n, result);
    printf("Total Recursive Calls Made: %d\\n", totalCalls);
    return 0;
}
`,
  },
  {
    id: 'binary-tree-recursion',
    title: 'Binary Search Tree (Pointers & Structs)',
    category: 'Data Structures',
    description: 'Binary Search Tree with dynamic pointers and recursive traversals.',
    defaultStdin: '50 30 20 40 70 60 80',
    code: `#include <stdio.h>
#include <stdlib.h>

// Binary Tree Node
struct Node {
    int data;
    struct Node *left;
    struct Node *right;
};

// Create new node
struct Node* createNode(int value) {
    struct Node* newNode = (struct Node*)malloc(sizeof(struct Node));
    newNode->data = value;
    newNode->left = NULL;
    newNode->right = NULL;
    return newNode;
}

// Recursive Insert into BST
struct Node* insert(struct Node* root, int value) {
    if (root == NULL) {
        return createNode(value);
    }
    if (value < root->data) {
        root->left = insert(root->left, value);
    } else if (value > root->data) {
        root->right = insert(root->right, value);
    }
    return root;
}

// Recursive Inorder Traversal (Sorted Output)
void inorder(struct Node* root) {
    if (root != NULL) {
        inorder(root->left);
        printf("%d ", root->data);
        inorder(root->right);
    }
}

// Recursive Preorder Traversal
void preorder(struct Node* root) {
    if (root != NULL) {
        printf("%d ", root->data);
        preorder(root->left);
        preorder(root->right);
    }
}

// Recursive Tree Height
int treeHeight(struct Node* root) {
    if (root == NULL) return 0;
    int leftH = treeHeight(root->left);
    int rightH = treeHeight(root->right);
    return (leftH > rightH ? leftH : rightH) + 1;
}

int main() {
    printf("=== Binary Search Tree with Recursive Traversal ===\\n");
    struct Node* root = NULL;
    int values[] = {50, 30, 20, 40, 70, 60, 80};
    int n = sizeof(values) / sizeof(values[0]);

    printf("Inserting values into BST: ");
    for (int i = 0; i < n; i++) {
        printf("%d ", values[i]);
        root = insert(root, values[i]);
    }
    printf("\\n\\n");

    printf("Inorder Traversal (Sorted):   ");
    inorder(root);
    printf("\\n");

    printf("Preorder Traversal:           ");
    preorder(root);
    printf("\\n");

    printf("Tree Height:                  %d\\n", treeHeight(root));
    return 0;
}
`,
  },
  {
    id: 'linked-list',
    title: 'Singly Linked List with Reversal',
    category: 'Data Structures',
    description: 'Dynamic memory allocation, insertion, traversal, and pointer manipulation.',
    defaultStdin: '',
    code: `#include <stdio.h>
#include <stdlib.h>

struct Node {
    int data;
    struct Node *next;
};

// Insert at head
void push(struct Node **headRef, int newData) {
    struct Node *newNode = (struct Node*)malloc(sizeof(struct Node));
    newNode->data = newData;
    newNode->next = *headRef;
    *headRef = newNode;
}

// Print linked list
void printList(struct Node *head) {
    struct Node *curr = head;
    while (curr != NULL) {
        printf("%d -> ", curr->data);
        curr = curr->next;
    }
    printf("NULL\\n");
}

// Reverse linked list iteratively
void reverseList(struct Node **headRef) {
    struct Node *prev = NULL;
    struct Node *curr = *headRef;
    struct Node *next = NULL;

    while (curr != NULL) {
        next = curr->next;
        curr->next = prev;
        prev = curr;
        curr = next;
    }
    *headRef = prev;
}

int main() {
    printf("=== Dynamic Linked List with In-Place Reversal ===\\n");
    struct Node *head = NULL;

    // Build list: 50 -> 40 -> 30 -> 20 -> 10 -> NULL
    for (int i = 10; i <= 50; i += 10) {
        push(&head, i);
    }

    printf("Original List: ");
    printList(head);

    printf("Reversing list pointers...\\n");
    reverseList(&head);

    printf("Reversed List: ");
    printList(head);

    return 0;
}
`,
  },
  {
    id: 'n-queens',
    title: 'N-Queens Solver (Backtracking Recursion)',
    category: 'Recursion',
    description: 'Backtracking algorithm placing N non-attacking queens on an N×N board.',
    defaultStdin: '4',
    code: `#include <stdio.h>

#define MAX_N 10

int board[MAX_N][MAX_N];
int solutionCount = 0;

// Check if a queen can be safely placed at board[row][col]
int isSafe(int n, int row, int col) {
    // Check this row on left side
    for (int i = 0; i < col; i++) {
        if (board[row][i]) return 0;
    }

    // Check upper diagonal on left side
    for (int i = row, j = col; i >= 0 && j >= 0; i--, j--) {
        if (board[i][j]) return 0;
    }

    // Check lower diagonal on left side
    for (int i = row, j = col; j >= 0 && i < n; i++, j--) {
        if (board[i][j]) return 0;
    }

    return 1;
}

void printBoard(int n) {
    solutionCount++;
    printf("Solution #%d:\\n", solutionCount);
    for (int i = 0; i < n; i++) {
        printf("  ");
        for (int j = 0; j < n; j++) {
            printf("%c ", board[i][j] ? 'Q' : '.');
        }
        printf("\\n");
    }
    printf("\\n");
}

// Recursive Backtracking function
void solveNQ(int n, int col) {
    if (col >= n) {
        printBoard(n);
        return;
    }

    for (int i = 0; i < n; i++) {
        if (isSafe(n, i, col)) {
            board[i][col] = 1;
            // Recur to place rest of the queens
            solveNQ(n, col + 1);
            // Backtrack
            board[i][col] = 0;
        }
    }
}

int main() {
    int n = 4;
    printf("=== N-Queens Recursive Backtracking ===\\n");
    printf("Enter board size N (e.g. 4): ");
    if (scanf("%d", &n) != 1 || n <= 0 || n > 8) {
        n = 4;
        printf("4 (default)\\n");
    }

    // Initialize board
    for (int i = 0; i < n; i++)
        for (int j = 0; j < n; j++)
            board[i][j] = 0;

    printf("\\nSearching for solutions on %dx%d board...\\n\\n", n, n);
    solveNQ(n, 0);

    printf("Total valid placements found: %d\\n", solutionCount);
    return 0;
}
`,
  },
]
