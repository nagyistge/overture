// -------------------------------------------------------------------------- \\
// File: MenuView.js                                                          \\
// Module: View                                                               \\
// Requires: Core, Foundation, DOM, View.js                                   \\
// Author: Neil Jenkins                                                       \\
// License: © 2010–2012 Opera Software ASA. All rights reserved.              \\
// -------------------------------------------------------------------------- \\

"use strict";

( function ( NS ) {

var MenuController = NS.Class({

    Extends: NS.Object,

    /*
        Property: O.MenuController#options

    */
    options: [],

    // --- Focus ---

    focussedOption: null,

    getAdjacentOption: function ( step ) {
        var options = this.get( 'options' ),
            l = options.length,
            i = options.indexOf( this.get( 'focussedOption' ) ),
            current;

        if ( i < 0 && step < 0 ) {
            i = l;
        }
        current = i;

        do {
            i = ( i + step ).mod( l );
        } while ( options[i].get( 'isHidden' ) && i !== current );

        return options[i];
    },

    focusPrevious: function () {
        this.focusOption( this.getAdjacentOption( -1 ) );
    },

    focusNext: function () {
        this.focusOption( this.getAdjacentOption( 1 ) );
    },

    focusOption: function ( option ) {
        var current = this.get( 'focussedOption' );
        if ( current !== option ) {
            if ( current ) {
                current.set( 'isFocussed', false );
            }
            if ( option ) {
                if ( option.get( 'isHidden' ) ) {
                    option = null;
                } else {
                    option.set( 'isFocussed', true );
                }
            }
            this.set( 'focussedOption', option );
        }
    },

    blurOption: function ( option ) {
        if ( this.get( 'focussedOption' ) === option ) {
            this.focusOption( null );
        }
    },

    selectFocussed: function () {
        var focussedOption = this.get( 'focussedOption' );
        if ( focussedOption && !focussedOption.get( 'isHidden' ) ) {
            focussedOption.activate();
        }
    },

    // --- Filter ---

    filter: '',

    filterDidChange: function () {
        var value = this.get( 'filter' ).escapeRegExp(),
            pattern = value ? new RegExp( '\\b' + value, 'i' ) : null,
            options = this.get( 'options' ),
            l = options.get( 'length' ),
            focussedOption = this.get( 'focussedOption' );

        while ( l-- ) {
            options[l].filter( pattern );
        }
        if ( !focussedOption || focussedOption.get( 'isHidden' ) ) {
            this.focusNext();
        }
    }.observes( 'filter' ),

    // --- Keyboard support ---

    keyBindings: {
        esc: 'onEscape',
        enter: 'selectFocussed',
        up: 'focusPrevious',
        down: 'focusNext'
    },

    triggerKeyBinding: function ( event ) {
        var key = NS.DOMEvent.lookupKey( event ),
            bindings = this.get( 'keyBindings' );
        if ( bindings[ key ] ) {
            event.preventDefault();
            event.stopPropagation();
            this[ bindings[ key ] ]( event, key );
        }
    }.on( 'keydown' ),

    onEscape: function ( event ) {
        var filter = this.get( 'filter' );
        if ( filter ) {
            this.set( 'filter', '' );
        } else {
            this.get( 'view' ).hide();
        }
        if ( event ) { event.preventDefault(); }
    }
});

var MenuOptionView = NS.Class({

    Extends: NS.View,

    isFocussed: false,
    isHidden: false,

    layerTag: 'li',

    className: function () {
        return 'MenuOptionView' +
            ( this.get( 'isFocussed' ) ? ' focussed' : '' ) +
            ( this.get( 'isHidden' ) ? ' hidden' : '' );
    }.property( 'isFocussed', 'isHidden' ),

    init: function ( view, controller ) {
        this.childViews = [ view ];
        this.controller = controller;
        MenuOptionView.parent.init.call( this );
    },

    takeFocus: function () {
        this.get( 'controller' ).focusOption( this );
    }.on( 'mouseover' ),

    loseFocus: function () {
        this.get( 'controller' ).blurOption( this );
    }.on( 'mouseout' ),

    filter: function ( pattern ) {
        var label = this.get( 'childViews' )[0].get( 'label' );
        this.set( 'isHidden', !!pattern && !pattern.test( label ) );
    },

    activate: function () {
        this.get( 'childViews' )[0].activate();
    }
});

var MenuView = NS.Class({

    Extends: NS.View,

    className: 'MenuView',

    showFilter: false,
    closeOnActivate: true,

    didCreateLayer: function ( layer ) {
        MenuView.parent.didCreateLayer.call( this, layer );
        layer.addEventListener( 'mouseover', this, false );
        layer.addEventListener( 'mouseout', this, false );
    },

    willDestroyLayer: function ( layer ) {
        layer.removeEventListener( 'mouseout', this, false );
        layer.removeEventListener( 'mouseover', this, false );
        MenuView.parent.willDestroyLayer.call( this, layer );
    },

    didAppendLayerToDocument: function () {
        MenuView.parent.didAppendLayerToDocument.call( this );
        var controller = this.get( 'controller' );
        if ( this.get( 'showFilter' ) ) {
            controller.focusOption( controller.get( 'options' )[0] );
            this._input.focus();
        }
        return this;
    },

    didRemoveLayerFromDocument: function () {
        this.get( 'controller' ).focusOption( null );
        return MenuView.parent.didRemoveLayerFromDocument.call( this );
    },

    nextEventTarget: function () {
        return this.get( 'controller' );
    }.property( 'controller' ),

    controller: function () {
        return new MenuController({
            view: this
        });
    }.property(),

    ItemView: MenuOptionView,

    _render: function ( layer ) {
        var Element = NS.Element,
            el = Element.create,
            controller = this.get( 'controller' ),
            MenuOptionView = this.get( 'ItemView' ),
            optionViews;
        Element.appendChildren( layer, [
            this.get( 'showFilter' ) ? el( 'div', [
                this._input = new NS.TextView({
                    value: new NS.Binding({
                        isTwoWay: true
                    }).from( 'filter', this.get( 'controller' ) )
                })
            ]) : null,
            new NS.ScrollView({
                positioning: 'relative',
                layout: {},
                layerTag: 'ul',
                childViews:
                    optionViews = this.get( 'options' ).map( function ( view ) {
                        return new MenuOptionView( view, controller );
                    })
            })
        ]);
        controller.set( 'options', optionViews );
    },

    hide: function ( event ) {
        if ( !event || this.get( 'closeOnActivate' ) ) {
            var parent = this.get( 'parentView' );
            if ( parent ) { parent.hide(); }
        }
    }.on( 'button:activate' ),

    fireShortcut: function ( event ) {
        if ( !this.get( 'showFilter' ) ) {
            var handler = NS.RootViewController
                            .kbShortcuts.getHandlerForEvent( event ),
                parent, object, method;
            if ( handler ) {
                parent = object = handler[0];
                method = handler[1];
                // Check object is child view of the menu; we want to ignore any
                // other keyboard shortcuts.
                if ( object instanceof NS.View ) {
                    while ( parent && parent !== this ) {
                        parent = parent.get( 'parentView' );
                    }
                    if ( parent ) {
                        object[ method ]( event );
                        event.preventDefault();
                    }
                }
            }
        }
    }.on( 'keypress' )
});

NS.MenuController = MenuController;
NS.MenuOptionView = MenuOptionView;
NS.MenuView = MenuView;

}( this.O ) );
