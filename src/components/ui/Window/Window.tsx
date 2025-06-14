import { Button, WindowContent, WindowHeader, Window } from "react95";

interface Props {
  headerText: string;
  contentText: string;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  active?: boolean;
}

const WindowCustom = ({
  active,
  headerText,
  contentText,
  isOpen,
  setIsOpen,
}: Props) => {
  const handleClose = () => {
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <Window style={{ position: "fixed", bottom: "70px", right: "15px" }}>
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
      <WindowContent>{contentText}</WindowContent>
    </Window>
  );
};

export { WindowCustom };
