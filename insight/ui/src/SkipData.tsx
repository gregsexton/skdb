export type SkipType =
  | SkipLambda
  | SkipObject
  | SkipString
  | SkipVector<SkipType>
  | SkipCall
  | SkipLiteral
  | SkipMap;

export interface SkipString {
  type: "string";
  value: string;
}

export interface SkipCall {
  type: "call";
  name: string;
  value: SkipType[];
}

export interface SkipLiteral {
  type: "literal";
  value: string;
}

export interface SkipMap {
  type: "map";
  name: "Map";
  value: SkipType[]; // k0, v0, k1, v1, ...
}

export interface SkipVector<T extends SkipType> {
  type: "vector";
  name: "Array" | "List";
  value: T[];
}

export interface SkipObject {
  type: "object";
  name: string;
  value: { [key: string]: SkipType };
}

export interface SkipLambda {
  type: "object";
  name: "Lambda";
  value: {
    source: SkipString;
    captured: {
      name: "captured";
      type: "object";
      value: { [key: string]: SkipType };
    };
  };
}

function SkipDataList({ values }: { values: SkipType[] }) {
  return (
    <ul>
      {values.map((v, i) => (
        <li key={i}>
          <SkipDatum value={v} />
        </li>
      ))}
    </ul>
  );
}

function SkipDataTable({
  entries,
  header = ["Variable", "Value"],
}: {
  entries: [string | SkipType, SkipType][];
  header?: [string, string];
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>{header[0]}</th>
          <th>{header[1]}</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([k, v], i) => (
          <tr key={i}>
            <td>
              {typeof k === "string" ? <pre>{k}</pre> : <SkipDatum value={k} />}
            </td>
            <td>
              <SkipDatum value={v} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SkipDatumSpan({ value }: { value: SkipLiteral | SkipString }) {
  switch (value.type) {
    case "literal":
      return <code>{value.value}</code>;
    case "string":
      return <code>"{value.value}"</code>;
    default:
      throw new Error("Unsupported value type.");
  }
}

export function SkipDatum({ value }: { value: SkipType }) {
  switch (value.type) {
    case "literal":
      return <pre>{value.value}</pre>;
    case "string":
      return <pre>"{value.value}"</pre>;
    case "call": {
      if (value.value.length < 1) {
        return <pre>{value.name}()</pre>;
      }

      if (value.value.every((v) => ["string", "literal"].includes(v.type))) {
        const vals = value.value as (SkipLiteral | SkipString)[];
        return (
          <pre>
            {value.name}(
            {vals.map((v, i) => (
              <span key={i}>
                <SkipDatumSpan value={v} />
                {i < vals.length - 1 ? "," : ""}
              </span>
            ))}
            )
          </pre>
        );
      }

      // tuple
      if (value.name.trim() === "") {
        return (
          <div>
            <h3>Tuple</h3>
            <SkipDataList values={value.value} />
          </div>
        );
      }

      return (
        <div>
          <h3>{value.name}</h3>
          <SkipDataTable
            entries={value.value.map((x, i) => [i.toString(), x])}
            header={["Arg", "Value"]}
          />
        </div>
      );
    }
    case "object":
      if (value.name === "Lambda") {
        const fn = value as SkipLambda;
        return (
          <div>
            <div>
              <h3>Source</h3>
              <pre>{fn.value.source.value}</pre>
            </div>
            <div>
              <h3>Closes over</h3>
              <SkipDataTable
                entries={Object.entries(fn.value.captured.value)}
              />
            </div>
          </div>
        );
      } else {
        return (
          <div>
            <div>
              <h3>{value.name}</h3>
            </div>
            <div>
              <h3>Attributes</h3>
              <SkipDataTable
                entries={Object.entries(value.value)}
                header={["Attribute", "Value"]}
              />
            </div>
          </div>
        );
      }
    case "vector":
      if (value.value.length < 1) {
        if (value.name === "Array") {
          return <pre>{value.name}[]</pre>;
        }
        return <pre>{value.name}()</pre>;
      }
      return (
        <div>
          <h3>{value.name} of</h3>
          <SkipDataTable
            entries={value.value.map((x, i) => [i.toString(), x])}
            header={["index", "Value"]}
          />
        </div>
      );
    case "map":
      if (value.value.length < 1) {
        return <pre>{value.name}()</pre>;
      }
      return (
        <div>
          <h3>{value.name} of</h3>
          <SkipDataTable
            entries={value.value
              .filter((_x, i) => i % 2 == 0)
              .map((key, i) => [key, value.value[i * 2 + 1]])}
            header={["Key", "Value"]}
          />
        </div>
      );
    default:
      return <pre>{JSON.stringify(value)}</pre>;
  }
}
