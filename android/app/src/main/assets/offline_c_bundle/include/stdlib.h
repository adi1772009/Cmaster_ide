/* ISO C99 Standard: 7.20 General utilities <stdlib.h> */
#ifndef _STDLIB_H
#define _STDLIB_H 1

#define EXIT_SUCCESS 0
#define EXIT_FAILURE 1
#define RAND_MAX 32767
#define NULL ((void*)0)

typedef unsigned int size_t;

void *malloc(size_t size);
void *calloc(size_t nmemb, size_t size);
void *realloc(void *ptr, size_t size);
void free(void *ptr);
void exit(int status);
int abs(int j);
long int labs(long int j);
int rand(void);
void srand(unsigned int seed);
double atof(const char *nptr);
int atoi(const char *nptr);
long int atol(const char *nptr);
void qsort(void *base, size_t nmemb, size_t size, int (*compar)(const void *, const void *));
void *bsearch(const void *key, const void *base, size_t nmemb, size_t size, int (*compar)(const void *, const void *));

#endif /* stdlib.h */
