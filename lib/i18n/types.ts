export type DictionaryTree = {
  readonly [key: string]: string | DictionaryTree;
};

export type DictionaryShape<T> = {
  readonly [Key in keyof T]: T[Key] extends string
    ? string
    : T[Key] extends DictionaryTree
      ? DictionaryShape<T[Key]>
      : never;
};

export type DictionaryOverlay<T> = {
  readonly [Key in keyof T]?: T[Key] extends string
    ? string
    : T[Key] extends DictionaryTree
      ? DictionaryOverlay<T[Key]>
      : never;
};

export type MessageValue = string | number;
export type MessageValues = Readonly<Record<string, MessageValue>>;
