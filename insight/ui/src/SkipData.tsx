import { ReactNode } from "react";

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

function TitledBlock({
  children,
  title,
}: {
  children?: ReactNode;
  title: string;
}) {
  return (
    <div className="skipValueContainer">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function DataBlock({ children }: { children: ReactNode }) {
  return <pre>{children}</pre>;
}

function DataSpan({ children }: { children: ReactNode }) {
  return <code>{children}</code>;
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
  if (entries.length < 1) {
    return <></>;
  }
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
              {typeof k === "string" ? (
                <DataBlock>{k}</DataBlock>
              ) : (
                <SkipDatum value={k} />
              )}
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
      return <DataSpan>{value.value}</DataSpan>;
    case "string":
      return <DataSpan>"{value.value}"</DataSpan>;
    default:
      throw new Error("Unsupported value type.");
  }
}

export function SkipDatum({ value }: { value: SkipType }) {
  switch (value.type) {
    case "literal":
      return <DataBlock>{value.value}</DataBlock>;
    case "string":
      return <DataBlock>"{value.value}"</DataBlock>;
    case "call": {
      if (value.value.length < 1) {
        return <DataBlock>{value.name}()</DataBlock>;
      }

      if (value.value.every((v) => ["string", "literal"].includes(v.type))) {
        const vals = value.value as (SkipLiteral | SkipString)[];
        return (
          <DataBlock>
            {value.name}(
            {vals.map((v, i) => (
              <span key={i}>
                <SkipDatumSpan value={v} />
                {i < vals.length - 1 ? "," : ""}
              </span>
            ))}
            )
          </DataBlock>
        );
      }

      // tuple
      if (value.name.trim() === "") {
        return (
          <TitledBlock title="Tuple">
            <SkipDataList values={value.value} />
          </TitledBlock>
        );
      }

      return (
        <TitledBlock title={value.name}>
          <SkipDataTable
            entries={value.value.map((x, i) => [i.toString(), x])}
            header={["Arg", "Value"]}
          />
        </TitledBlock>
      );
    }
    case "object":
      if (value.name === "Lambda") {
        const fn = value as SkipLambda;
        const closure = Object.entries(fn.value.captured.value);
        return (
          <div>
            <TitledBlock title="Lambda">
              <DataBlock>{fn.value.source.value}</DataBlock>
            </TitledBlock>
            <TitledBlock
              title={closure.length < 1 ? "Empty closure" : "Closes over"}
            >
              <SkipDataTable entries={closure} />
            </TitledBlock>
          </div>
        );
      } else {
        return (
          <TitledBlock title={value.name}>
            <SkipDataTable
              entries={Object.entries(value.value)}
              header={["Attribute", "Value"]}
            />
          </TitledBlock>
        );
      }
    case "vector":
      if (value.value.length < 1) {
        if (value.name === "Array") {
          return <DataBlock>{value.name}[]</DataBlock>;
        }
        return <DataBlock>{value.name}()</DataBlock>;
      }
      return (
        <TitledBlock title={`${value.name} of`}>
          <SkipDataTable
            entries={value.value.map((x, i) => [i.toString(), x])}
            header={["index", "Value"]}
          />
        </TitledBlock>
      );
    case "map":
      if (value.value.length < 1) {
        return <DataBlock>{value.name}()</DataBlock>;
      }
      return (
        <TitledBlock title={`${value.name} of`}>
          <SkipDataTable
            entries={value.value
              .filter((_x, i) => i % 2 == 0)
              .map((key, i) => [key, value.value[i * 2 + 1]])}
            header={["Key", "Value"]}
          />
        </TitledBlock>
      );
    default:
      return <DataBlock>{JSON.stringify(value)}</DataBlock>;
  }
}
