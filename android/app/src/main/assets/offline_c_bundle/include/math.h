/* ISO C99 Standard: 7.12 Mathematics <math.h> */
#ifndef _MATH_H
#define _MATH_H 1

#define M_PI 3.14159265358979323846
#define M_E  2.71828182845904523536

double sqrt(double x);
double pow(double base, double exp);
double sin(double x);
double cos(double x);
double tan(double x);
double asin(double x);
double acos(double x);
double atan(double x);
double atan2(double y, double x);
double log(double x);
double log10(double x);
double exp(double x);
double ceil(double x);
double floor(double x);
double fabs(double x);
double fmod(double x, double y);

#endif /* math.h */
