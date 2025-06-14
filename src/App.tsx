import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { styleReset } from "react95";
import styled, { createGlobalStyle, ThemeProvider } from "styled-components";
import ms_sans_serif from "react95/dist/fonts/ms_sans_serif.woff2";
import ms_sans_serif_bold from "react95/dist/fonts/ms_sans_serif_bold.woff2";
import theme from "react95/dist/themes/marine";
import { Footer } from "./components/Footer";
import { Outlet, useNavigate } from "react-router";
import { useEffect } from "react";

const GlobalStyles = createGlobalStyle`
    ${styleReset}

    @font-face {
        font-family: 'ms_sans_serif';
        src: url('${ms_sans_serif}') format('woff2');
        font-weight: 400;
        font-style: normal
    }

    @font-face {
        font-family: 'ms_sans_serif';
        src: url('${ms_sans_serif_bold}') format('woff2');
        font-weight: bold;
        font-style: normal
    }

    body {
        font-family: 'ms_sans_serif';
    }
`;

const Wrapper = styled.div<{ theme?: string }>`
  padding: 5rem;
  background: ${({ theme }) => (theme as any).desktopBackground};
  height: 100%;
`;

const App = () => {
  const queryCLient = new QueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/auth");
    }
  }, []);

  return (
    <QueryClientProvider client={queryCLient}>
      <GlobalStyles />
      <ThemeProvider theme={theme}>
        <Wrapper>
          <Outlet />
          <Footer />
        </Wrapper>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
