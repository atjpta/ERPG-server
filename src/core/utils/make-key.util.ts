export const makeKey = (...args: (string | number)[]): string => {
    return args.join("_");
};
