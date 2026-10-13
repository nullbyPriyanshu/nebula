export type Slice = {
  id: string;
  offset: number;
  bytes: number;
};

// Turns the byte counts chosen by plan() into consecutive slices of the file.
export function splitLayout(parts: { id: string; bytes: number }[]): Slice[] {
  let offset = 0;

  return parts.map((part) => {
    const slice = { id: part.id, offset, bytes: part.bytes };

    offset += part.bytes;

    return slice;
  });
}

export const partName = (name: string, index: number, total: number) =>
  `${name}.part${index}of${total}`;
