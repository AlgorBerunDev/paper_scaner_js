import WebCamera from "./components/WebCamera";

function App() {
  return <WebCamera onCapture={blob => console.log("Captured:", blob)} />;
}

export default App;
