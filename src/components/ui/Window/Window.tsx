import { Button, WindowContent, WindowHeader, Window } from "react95";
import type { CSSProperties, ReactNode } from "react";

interface Props {
  headerText: string;
  contentText?: string;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  active?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}

const WindowCustom = ({
  active,
  headerText,
  contentText,
  isOpen,
  setIsOpen,
  children,
  style,
}: Props) => {
  const handleClose = () => {
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <Window
      style={
        style ? style : { position: "fixed", bottom: "70px", right: "15px" }
      }
    >
      <WindowHeader
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
        active={active}
      >
        <span>{headerText}</span>
        <Button onClick={handleClose}>
          <Button variant={"raised"}>X</Button>
        </Button>
      </WindowHeader>
      <WindowContent>{children ?? contentText}</WindowContent>
    </Window>
  );
};

export { WindowCustom };
