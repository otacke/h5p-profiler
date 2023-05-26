import Util from '@services/util';
import Dictionary from '@services/dictionary';
import Globals from '@services/globals';
import Screenreader from '@services/screenreader';
import Content from '@components/content';
import QuestionTypeContract from '@mixins/question-type-contract';
import XAPI from '@mixins/xapi';
import Color from 'color';
import '@styles/h5p-personality-quiz.scss';

export default class PersonalityQuiz extends H5P.EventDispatcher {
  /**
   * @class
   * @param {object} params Parameters passed by the editor.
   * @param {number} contentId Content's id.
   * @param {object} [extras] Saved state, metadata, etc.
   */
  constructor(params, contentId, extras = {}) {
    super();

    Util.addMixins(PersonalityQuiz, [QuestionTypeContract, XAPI]);

    // Sanitize parameters
    this.params = Util.extend({
      titleScreen: {
        title: {}
      },
      questionsGroup: {
        questions: []
      },
      personalitiesGroup: {
        personalities: []
      },
      visual: {
        isAnimationOn: true,
        appearance: 'classic',
        colorButton: '#1a73d9',
        colorProgressBar: '#1a73d9'
      },
      l10n: {
        noQuestions: 'It seems that there is no valid question set. Try checking for valid personality names.',
        noPersonalities: 'It seems that there are not enough valid personalities set. Try checking for missing names or duplicate names.',
        start: 'Start',
        currentOfTotal: '@current of @total',
        skip: 'Skip',
        reset: 'Retake the quiz',
        notFinished: 'The quiz was not yet finished'
      },
      a11y: {
        titleScreenWasOpened: 'The title screen was opened.',
        wheelStarted: 'The wheel of fortune started spinning. Please wait a moment.',
        progressBar: 'Progress bar',
        resultsTitle: 'Here are your results.'
      }
    }, params);

    // Override result screen animation if required
    if (!this.params.visual.isAnimationOn) {
      this.params.resultScreen.animation = 'none';
    }

    this.sanitizeParameters();

    this.contentId = contentId;
    this.extras = extras;

    // Screenreader for polite screen reading
    document.body.append(Screenreader.getDOM());

    // Globals
    Globals.set('contentId', this.contentId);
    Globals.set('resize', () => {
      this.trigger('resize');
    });
    Globals.set('read', (text) => {
      Screenreader.read(text);
    });
    Globals.set('triggerXAPIEvent', (verb) => {
      return this.triggerXAPIEvent(verb);
    });

    // Fill dictionary
    Dictionary.fill({ l10n: this.params.l10n, a11y: this.params.a11y });

    this.previousState = extras?.previousState || {};

    const defaultLanguage = extras?.metadata?.defaultLanguage || 'en';
    this.languageTag = Util.formatLanguageCode(defaultLanguage);

    this.dom = this.buildDOM();

    this.setupColorScheme();
  }

  /**
   * Attach library to wrapper.
   * @param {H5P.jQuery} $wrapper Content's container.
   */
  attach($wrapper) {
    $wrapper.get(0).classList.add('h5p-personality-quiz');
    $wrapper.get(0).appendChild(this.dom);
  }

  /**
   * Build main DOM.
   * @returns {HTMLElement} Main DOM.
   */
  buildDOM() {
    const dom = document.createElement('div');
    dom.classList.add('h5p-personality-quiz-main');

    this.content = new Content({
      appearance: this.params.visual.appearance,
      previousState: this.previousState,
      personalities: this.params.personalities,
      questions: this.params.questions,
      colorProgressBar: this.params.visual.colorProgressBar,
      isAnimationOn: this.params.visual.isAnimationOn,
      resultScreen: this.params.resultScreen,
      ...(this.params.showTitleScreen &&
        {
          titleScreen: {
            titleScreenIntroduction:
              this.params.titleScreen.titleScreenIntroduction,
            titleScreenMedium:
              this.params.titleScreen.titleScreenMedium
          }
        }
      )
    });

    this.on('resize', () => {
      this.content.resize();
    });

    dom.append(this.content.getDOM());

    return dom;
  }

  /**
   * Sanitize parameters.
   */
  sanitizeParameters() {
    // Personalities
    this.params.personalities = this.params.personalitiesGroup.personalities
      .reduce((results, personality) => {
        if (!personality.name || personality.name.length === 0) {
          return results;
        }

        // Can't use toLowerCase(), because this will be printed
        personality.name = personality.name.trim();

        if (results.some((result) => result.name === personality.name)) {
          return results; // Duplicate
        }

        return [...results, personality];
      }, []);
    delete this.params.personalitiesGroup;

    // answer-personalities-relation
    this.params.questions = this.params.questionsGroup.questions
      .map((question) => {
        question.answers = this.filterAnswers(question.answers);
        question.answers = question.answers.map((option) => {
          option.text = option.text ?? '\u3164';
          return option;
        });

        return question;
      })
      .filter((question) => question.answers.length !== 0);
    delete this.params.questionsGroup;
  }

  /**
   * Filter answers to only keep valid answers.
   * @param {object[]} answers Answers.
   * @returns {object[]} Filtered answers.
   */
  filterAnswers(answers) {
    return answers
      .map((answer) => {
        answer.personality =
          this.sanitizeOptionPersonalities(answer.personality);
        return answer;
      })
      .filter((answer) => answer.personality !== '');
  }

  /**
   * Sanitize list of personalities of answer option.
   * @param {string} personalities Personalities.
   * @returns {string} Sanitized list of personalities of answer option.
   */
  sanitizeOptionPersonalities(personalities) {
    if (typeof personalities !== 'string') {
      return '';
    }

    return personalities
      .split(',')
      .map((personality) => {
        return this.sanitizePersonalityOption(personality);
      })
      .filter((personality) => personality !== null)
      .join(',');
  }

  /**
   * Sanitize personality option.
   * @param {string} value Personality name and potentially score.
   * @returns {string|null} Sanitized personality option or `null` on error.
   */
  sanitizePersonalityOption(value) {
    let name, score;
    if (value.match(/=-?\d+$/)) {
      const segments = value.split('=');
      score = segments.pop();
      name = segments.join('=');
    }
    else {
      score = 1;
      name = value;
    }

    name = name.trim().toLowerCase();

    if (!this.isPersonalityNameValid(name)) {
      return null;
    }

    return `${name}=${score}`;
  }

  /**
   * Determine whether personality name is valid.
   * @param {string} value Personality name.
   * @returns {boolean} True if valid, else false.
   */
  isPersonalityNameValid(value) {
    return this.params.personalities
      .some((personality) => personality.name.toLowerCase() === value);
  }

  /**
   * Setup color scheme.
   */
  setupColorScheme() {
    const colorBase = Color(this.params.visual.colorButton);
    const colorText = (colorBase.isDark()) ?
      '#ffffff' :
      '#000000';

    const colorHover = (colorBase.isDark()) ?
      colorBase.darken(0.25) :
      colorBase.lighten(0.25);

    const colorActive = (colorBase.isDark()) ?
      colorBase.darken(0.37) :
      colorBase.lighten(0.37);

    const colorTextActive = (colorActive.isDark()) ?
      '#ffffff' :
      '#000000';

    const colorPale = colorBase.mix(Color('#ffffff'), 0.9);

    this.dom.style.setProperty('--color-button-background', colorBase.hex());
    this.dom.style.setProperty('--color-button-text', colorText);
    this.dom.style.setProperty('--color-button-hover', colorHover);
    this.dom.style.setProperty('--color-button-active', colorActive);
    this.dom.style.setProperty('--color-button-text-active', colorTextActive);
    this.dom.style.setProperty('--color-button-pale', colorPale);
  }

  /**
   * Get current state.
   * @returns {object} Current state.
   */
  getCurrentState() {
    return this.content?.getCurrentState();
  }

  /**
   * Get task title.
   * @returns {string} Title.
   */
  getTitle() {
    // H5P Core function: createTitle
    return H5P.createTitle(
      this.extras?.metadata?.title || PersonalityQuiz.DEFAULT_DESCRIPTION
    );
  }

  /**
   * Get description.
   * @returns {string} Description.
   */
  getDescription() {
    return PersonalityQuiz.DEFAULT_DESCRIPTION;
  }
}

/** @constant {string} Default description */
PersonalityQuiz.DEFAULT_DESCRIPTION = 'Personality Quiz';
