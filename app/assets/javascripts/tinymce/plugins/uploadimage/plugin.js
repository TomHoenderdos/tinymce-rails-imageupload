(function() {
  tinymce.PluginManager.requireLangPack('uploadimage');

  tinymce.create('tinymce.plugins.UploadImage', {
    UploadImage: function(ed, url) {
      var form,
          iframe,
          win,
          throbber,
          editor = ed;

      function showDialog() {

        function removePixelSuffix(value) {
          if (value) {
            value = value.replace(/px$/, '');
          }

          return value;
        }
        function mergeMargins(css) {
          if (css.margin) {

            var splitMargin = css.margin.split(" ");

            switch (splitMargin.length) {
              case 1: //margin: toprightbottomleft;
                css['margin-top'] = css['margin-top'] || splitMargin[0];
                css['margin-right'] = css['margin-right'] || splitMargin[0];
                css['margin-bottom'] = css['margin-bottom'] || splitMargin[0];
                css['margin-left'] = css['margin-left'] || splitMargin[0];
                break;
              case 2: //margin: topbottom rightleft;
                css['margin-top'] = css['margin-top'] || splitMargin[0];
                css['margin-right'] = css['margin-right'] || splitMargin[1];
                css['margin-bottom'] = css['margin-bottom'] || splitMargin[0];
                css['margin-left'] = css['margin-left'] || splitMargin[1];
                break;
              case 3: //margin: top rightleft bottom;
                css['margin-top'] = css['margin-top'] || splitMargin[0];
                css['margin-right'] = css['margin-right'] || splitMargin[1];
                css['margin-bottom'] = css['margin-bottom'] || splitMargin[2];
                css['margin-left'] = css['margin-left'] || splitMargin[1];
                break;
              case 4: //margin: top right bottom left;
                css['margin-top'] = css['margin-top'] || splitMargin[0];
                css['margin-right'] = css['margin-right'] || splitMargin[1];
                css['margin-bottom'] = css['margin-bottom'] || splitMargin[2];
                css['margin-left'] = css['margin-left'] || splitMargin[3];
            }
            delete css.margin;
          }
          return css;
        }

        function updateStyle() {
    			function addPixelSuffix(value) {
    				if (value.length > 0 && /^[0-9]+$/.test(value)) {
    					value += 'px';
    				}

    				return value;
    			}

    			if (!editor.settings.image_advtab) {
    				return;
    			}

    			var data = win.toJSON(),
    				css = dom.parseStyle(data.style);

    			css = mergeMargins(css);

    			if (data.vspace) {
    				css['margin-top'] = css['margin-bottom'] = addPixelSuffix(data.vspace);
    			}
    			if (data.hspace) {
    				css['margin-left'] = css['margin-right'] = addPixelSuffix(data.hspace);
    			}
    			if (data.border) {
    				css['border-width'] = addPixelSuffix(data.border);
    			}

    			win.find('#style').value(dom.serializeStyle(dom.parseStyle(dom.serializeStyle(css))));
    		}

        win = editor.windowManager.open({
          title: ed.translate('Insert an image from your computer'),
          width:  500 + parseInt(editor.getLang('uploadimage.delta_width', 0), 10),
          height: 180 + parseInt(editor.getLang('uploadimage.delta_height', 0), 10),
          body: [
            {type: 'iframe',  url: 'javascript:void(0)'},
            {type: 'textbox', name: 'file', label: ed.translate('Choose an image'), subtype: 'file'},
            {type: 'textbox', name: 'alt',  label: ed.translate('Image description')},


            {type: 'container', layout: 'grid', packV: 'start', columns: 2, padding: 0, alignH: ['left', 'right'],
								defaults: {
									type: 'textbox',
									maxWidth: 50,
									onchange: updateStyle
								},
								items: [
									{label: 'Vertical space', name: 'vspace'},
									{label: 'Horizontal space', name: 'hspace'},
									{label: 'Border', name: 'border'}
								]
						},




            {type: 'container', classes: 'error', html: "<p style='color: #b94a48;'>&nbsp;</p>"},

            // Trick TinyMCE to add a empty div that "preloads" the throbber image
            {type: 'container', classes: 'throbber'},
          ],
          buttons: [
            {
              text: ed.translate('Insert'),
              onclick: insertImage,
              subtype: 'primary'
            },
            {
              text: ed.translate('Cancel'),
              onclick: ed.windowManager.close
            }
          ],
        }, {
          plugin_url: url
        });

        // TinyMCE likes pointless submit handlers
        win.off('submit');
        win.on('submit', insertImage);

        /* WHY DO YOU HATE <form>, TINYMCE!? */
        iframe = win.find("iframe")[0];
        form = createElement('form', {
          action: ed.getParam("uploadimage_form_url", "/tinymce_assets"),
          target: iframe._id,
          method: "POST",
          enctype: 'multipart/form-data',
          accept_charset: "UTF-8",
        });

        // Might have several instances on the same page,
        // so we TinyMCE create unique IDs and use those.
        iframe.getEl().name = iframe._id;

        // Create some needed hidden inputs
        form.appendChild(createElement('input', {type: "hidden", name: "utf8", value: "✓"}));
        form.appendChild(createElement('input', {type: 'hidden', name: 'authenticity_token', value: getMetaContents('csrf-token')}));
        form.appendChild(createElement('input', {type: 'hidden', name: 'hint', value: ed.getParam("uploadimage_hint", "")}));

        var el = win.getEl();
        var body = document.getElementById(el.id + "-body");

        // Copy everything TinyMCE made into our form
        var containers = body.getElementsByClassName('mce-container');
        for(var i = 0; i < containers.length; i++) {
          form.appendChild(containers[i]);
        }

        // Fix inputs, since TinyMCE hates HTML and forms
        var inputs = form.getElementsByTagName('input');
        for(var i = 0; i < inputs.length; i++) {
          var ctrl = inputs[i];

          if(ctrl.tagName.toLowerCase() == 'input' && ctrl.type != "hidden") {
            if(ctrl.type == "file") {
              ctrl.name = "file";

              // Hack styles
              tinymce.DOM.setStyles(ctrl, {
                'border': 0,
                'boxShadow': 'none',
                'webkitBoxShadow': 'none',
              });
            } else {
              ctrl.name = "alt";
            }
          }
        }

        body.appendChild(form);
      }

      function insertImage() {
        if(getInputValue("file") == "") {
          return handleError('You must choose a file');
        }

        throbber = new top.tinymce.ui.Throbber(win.getEl());
        throbber.show();

        clearErrors();

        /* Add event listeners.
         * We remove the existing to avoid them being called twice in case
         * of errors and re-submitting afterwards.
         */
        var target = iframe.getEl();
        if(target.attachEvent) {
          target.detachEvent('onload', uploadDone);
          target.attachEvent('onload', uploadDone);
        } else {
          target.removeEventListener('load', uploadDone);
          target.addEventListener('load', uploadDone, false);
        }

        form.submit();
      }

      function uploadDone() {
        if(throbber) {
          throbber.hide();
        }

        var target = iframe.getEl();
        if(target.document || target.contentDocument) {
          var doc = target.contentDocument || target.contentWindow.document;
          handleResponse(doc.getElementsByTagName("body")[0].innerHTML);
        } else {
          handleError("Didn't get a response from the server");
        }
      }

      function handleResponse(ret) {
        try {
          var json = tinymce.util.JSON.parse(ret);

          if(json["error"]) {
            handleError(json["error"]["message"]);
          } else {
            ed.execCommand('mceInsertContent', false, buildHTML(json));
            ed.windowManager.close();
          }
        } catch(e) {
          handleError('Got a bad response from the server');
        }
      }

      function clearErrors() {
        var message = win.find(".error")[0].getEl();

        if(message)
          message.getElementsByTagName("p")[0].innerHTML = "&nbsp;";
      }

      function handleError(error) {
        var message = win.find(".error")[0].getEl();

        if(message)
          message.getElementsByTagName("p")[0].innerHTML = ed.translate(error);
      }

      function createElement(element, attributes) {
        var el = document.createElement(element);
        for(var property in attributes) {
          if (!(attributes[property] instanceof Function)) {
            el[property] = attributes[property];
          }
        }

        return el;
      }

      function buildHTML(json) {
        var default_class = ed.getParam("uploadimage_default_img_class", "");
        var figure = ed.getParam("uploadimage_figure", false);
        var alt_text = getInputValue("alt");

        var imgstr = "<img src='" + json["image"]["url"] + "'";

        if(default_class != "")
          imgstr += " class='" + default_class + "'";

        if(json["image"]["height"])
          imgstr += " height='" + json["image"]["height"] + "'";
        if(json["image"]["width"])
          imgstr += " width='"  + json["image"]["width"]  + "'";

        imgstr += " alt='" + alt_text + "'/>";

        if(figure) {
          var figureClass = ed.getParam("uploadimage_figure_class", "figure");
          var figcaptionClass = ed.getParam("uploadimage_figcaption_class", "figcaption");

          var figstr = "<figure";

          if (figureClass !== "")
            figstr += " class='" + figureClass + "'";
          figstr += ">" + imgstr;
          figstr += "<figcaption";
          if (figcaptionClass != "")
            figstr += " class='" + figcaptionClass + "'";
          figstr += ">" + alt_text + "</figcaption>";
          figstr += "</figure>";

          return figstr;
        } else {
          return imgstr;
        }
      }

      function getInputValue(name) {
        var inputs = form.getElementsByTagName("input");

        for(var i in inputs)
          if(inputs[i].name == name)
            return inputs[i].value;

        return "";
      }

      function getMetaContents(mn) {
        var m = document.getElementsByTagName('meta');

        for(var i in m)
          if(m[i].name == mn)
            return m[i].content;

        return null;
      }

      // Add a button that opens a window
      editor.addButton('uploadimage', {
        tooltip: ed.translate('Insert an image from your computer'),
        icon : 'image',
        onclick: showDialog
      });

      // Adds a menu item to the tools menu
      editor.addMenuItem('uploadimage', {
        text: ed.translate('Insert an image from your computer'),
        icon : 'image',
        context: 'insert',
        onclick: showDialog
      });
    }
  });

  tinymce.PluginManager.add('uploadimage', tinymce.plugins.UploadImage);
})();
