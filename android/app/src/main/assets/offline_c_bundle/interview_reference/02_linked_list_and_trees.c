/* Linked List Reversal and Binary Search Trees */
#include <stdio.h>
#include <stdlib.h>

struct Node { int data; struct Node* next; };
struct TreeNode { int val; struct TreeNode* left; struct TreeNode* right; };

// Reverse a Singly Linked List
struct Node* reverseList(struct Node* head) {
    struct Node *prev = NULL, *curr = head, *next = NULL;
    while (curr != NULL) {
        next = curr->next;
        curr->next = prev;
        prev = curr;
        curr = next;
    }
    return prev;
}

// BST Insertion
struct TreeNode* insertBST(struct TreeNode* root, int val) {
    if (root == NULL) {
        struct TreeNode* n = (struct TreeNode*)malloc(sizeof(struct TreeNode));
        n->val = val; n->left = n->right = NULL;
        return n;
    }
    if (val < root->val) root->left = insertBST(root->left, val);
    else root->right = insertBST(root->right, val);
    return root;
}
