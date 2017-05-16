'use strict'

import React from 'react'
import ReactDOM from 'react-dom'
import Codemirror from 'react-codemirror'
import BufferHelper from './BufferHelper'
require('codemirror/mode/javascript/javascript')
require('codemirror/addon/lint/json-lint')
require('codemirror/addon/lint/lint')
require('codemirror/addon/selection/active-line')
require('codemirror/addon/edit/closebrackets')
require('codemirror/addon/edit/matchbrackets')
require('codemirror/addon/fold/brace-fold')
require('codemirror/addon/fold/foldcode')
require('codemirror/addon/fold/foldgutter')
require('codemirror/addon/search/search')
require('codemirror/addon/search/searchcursor')
require('codemirror/addon/search/jump-to-line')
require('codemirror/addon/dialog/dialog')
require('codemirror/addon/dialog/dialog.css')
import jsonlint from 'jsonlint'
window.jsonlint = jsonlint.parser
require('codemirror/lib/codemirror.css')
require('codemirror/addon/lint/lint.css')
require('codemirror/addon/fold/foldgutter.css')
const msgpack = require('msgpack5')()

require('./index.scss')

class Editor extends React.PureComponent {
  constructor() {
    super()
    this.state = {
      currentMode: '',
      wrapping: true,
      changed: false,
      encoding: "plain",
      modes: {
        raw: false,
        json: false
      }
    }
  }

  updateLayout() {
    const $this = $(ReactDOM.findDOMNode(this))
    if ($this.width() < 372) {
      $(ReactDOM.findDOMNode(this.refs.wrapCheckboxContainer)).hide()
    } else {
      $(ReactDOM.findDOMNode(this.refs.wrapCheckboxContainer)).show()
    }
    this.refs.codemirror.getCodeMirror().refresh()
  }

  componentDidMount() {
    this.updateLayoutBinded = this.updateLayout.bind(this)
    $(window).on('resize', this.updateLayoutBinded)
    this.init(this.props.buffer)
  }

  componentWillUnmount() {
    $(window).off('resize', this.updateLayoutBinded)
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.buffer !== this.props.buffer) {
      this.init(nextProps.buffer)
    }
  }

  init(buffer) {
    if (!buffer) {
      this.setState({currentMode: '', changed: false})
      return
    }

    BufferHelper.decode(buffer)
      .then(result => {
        const content = result.content;
        const encoding = result.encoding;
        const modes = {};
        modes.raw = content;
        modes.json = BufferHelper.tryFormatJSON(content, true);
        const currentMode = modes.json ? 'json' : 'raw';
        this.setState({ modes, encoding, currentMode, changed: false }, () => {
          this.updateLayout();
        });
      });
  }

  save() {
    let content = this.state.modes.raw
    if (this.state.currentMode === 'json') {
      content = BufferHelper.tryFormatJSON(this.state.modes.json);
      if (!content) {
        alert('The json is invalid. Please check again.')
        return
      }
    }
    BufferHelper.encode(content, this.state.encoding)
      .then(buffer => {
        this.props.onSave(buffer, err => {
          if (err) {
            return alert(`Redis save failed: ${err.message}`);
          }

          this.init(buffer);
        });
      })
      .catch(err => {
        alert(err.message);
      });
  }

  updateContent(mode, content) {
    if (this.state.modes[mode] !== content) {
      this.state.modes[mode] = content
      this.setState({modes: this.state.modes, changed: true})
    }
  }

  updateEncoding(evt) {
    const encoding = evt.target.value;
    const content = this.state.modes[this.state.currentMode];

    BufferHelper.encode(content, encoding)
      .then(() => {
        this.setState({ encoding, changed: true });
      })
      .catch(err => {
        alert(err.message);
      });
  }

  updateMode(evt) {
    const newMode = evt.target.value
    this.setState({currentMode: newMode})
  }

  focus() {
    const codemirror = this.refs.codemirror
    if (codemirror) {
      const node = ReactDOM.findDOMNode(codemirror)
      if (node) {
        node.focus()
      }
    }
  }

  handleKeyDown(evt) {
    if (!evt.ctrlKey && evt.metaKey && evt.keyCode === 83) {
      this.save()
      evt.preventDefault()
      evt.stopPropagation()
    }
  }

  render() {
    const viewer = this.getViewer();

    return (
      <div
        className="Editor"
        onKeyDown={this.handleKeyDown.bind(this)}>
        <div className="viewerContainer">
          {viewer}
        </div>
        <div className="operation-panel">
          <div className="left-container">
            <button
              className="nt-button"
              disabled={!this.state.changed}
              onClick={this.save.bind(this)} >
              Save Changes
            </button>
            <select
              value={this.state.encoding}
              onChange={this.updateEncoding.bind(this)} >
              <option value="plain">Plain</option>
              <option value="gzip">GZIP</option>
              <option value="gz64">GZ64</option>
              <option value="messagepack">MessagePack</option>
            </select>
          </div>
          <label className="checkbox-container" ref="wrapCheckboxContainer">
            <input
              type="checkbox"
              checked={this.state.wrapping}
              onChange={evt => this.setState({ wrapping: evt.target.checked })} />
            <span>Wrap lines</span>
          </label>
          <select
            value={this.state.currentMode}
            onChange={this.updateMode.bind(this)} >
            <option value="raw" disabled={typeof this.state.modes.raw !== 'string'}>Raw</option>
            <option value="json" disabled={typeof this.state.modes.json !== 'string'}>JSON</option>
          </select>
        </div>
      </div>
    );
  }

  getViewer() {
    const rawOptions = {
      mode: 'none',
      styleActiveLine: true,
      lineWrapping: this.state.wrapping,
      gutters: ['CodeMirror-lint-markers', 'CodeMirror-foldgutter'],
      lineNumbers: true
    };

    if (this.state.currentMode === 'raw') {
      return (
        <Codemirror
          ref="codemirror"
          key="raw"
          value={this.state.modes.raw}
          onChange={this.updateContent.bind(this, 'raw')}
          options={rawOptions}
        />
      );
    }

    const javascriptOptions = {
      ...rawOptions,
      mode: {
        name: 'javascript',
        json: true
      },
      tabSize: 2,
      foldGutter: true,
      indentWithTabs: true,
      autoCloseBrackets: true,
      matchTags: true,
      lint: !!this.state.modes.raw
    };

    if (this.state.currentMode === 'json') {
      return (
        <Codemirror
          ref="codemirror"
          key="json"
          value={this.state.modes.json}
          onChange={this.updateContent.bind(this, 'json')}
          options={javascriptOptions}
        />
      );
    }

    return null;
  }
}

export default Editor