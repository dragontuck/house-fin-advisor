const TYPES = {
    A: "a" as const,
    B: "b" as const,
    C: "c" as const,
};

type MyType = typeof TYPES[keyof typeof TYPES];

function testFunc(value: MyType) {
    if (value === TYPES.A) {
        console.log("A");
    }
    if (value === TYPES.B) {
        console.log("B");
    }
    if (value === TYPES.C) {
        console.log("C");
    }
}

