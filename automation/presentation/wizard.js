// automation/presentation/wizard.js

export function startPresentationWizard(session) {
  session.mode = "presentation_wizard";
  session.step = 0;
  session.data = {};

  return askNextQuestion(session);
}

export function handleWizardInput(session, userInput) {
  const step = session.step;

  switch (step) {
    case 0:
      session.data.topic = userInput;
      break;

    case 1:
      session.data.audience = userInput;
      break;

    case 2:
      session.data.slides = userInput;
      break;

    case 3:
      session.data.style = userInput;
      break;

    case 4:
      session.data.format = userInput;
      break;

    default:
      session.mode = null;
      return {
        done: true,
        data: session.data
      };
  }

  session.step++;
  return askNextQuestion(session);
}

function askNextQuestion(session) {
  const questions = [
    "What is the presentation topic?",
    "Who is the target audience?",
    "How many slides do you want?",
    "Choose a style (minimal / corporate / cyberpunk / academic)",
    "Choose output format:\n1) Google Slides\n2) 3D Web Presentation\n3) PDF\n4) 3D Video"
  ];

  if (session.step >= questions.length) {
    session.mode = null;
    return {
      done: true,
      data: session.data
    };
  }

  return {
    done: false,
    message: questions[session.step]
  };
}

