// TODO remove when @types/yup are updated
declare module 'yup' {
  interface Schema<T = any> {

  }

  // 'defined' method is missing in schema type declaration
  interface MixedSchema<T = any> extends Schema<T> {
    defined(): MixedSchema<T>;
  }
  interface StringSchema<T extends string | null | undefined = string> extends Schema<T> {
    defined(): StringSchema<T>;
  }
}

export {};
