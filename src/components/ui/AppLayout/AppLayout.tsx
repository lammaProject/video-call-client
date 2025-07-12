import type { ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
}

const AppLayout = ({ title, children }: Props) => {
  return (
    <span
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        width: "fit-content",
      }}
    >
      {children}
      <p style={{ color: "white" }}>{title}</p>
    </span>
  );
};

export { AppLayout };
