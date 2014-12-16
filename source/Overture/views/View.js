// -------------------------------------------------------------------------- \\
// File: View.js                                                              \\
// Module: View                                                               \\
// Requires: Core, Foundation, DOM, UA                                        \\
// Author: Neil Jenkins                                                       \\
// License: © 2010-2014 FastMail Pty Ltd. All rights reserved.                \\
// -------------------------------------------------------------------------- \\

"use strict";

( function ( NS, undefined ) {

var UID = 0;

var POSITION_SAME = 0x00,
    POSITION_DISCONNECTED = 0x01,
    POSITION_PRECEDING = 0x02,
    POSITION_FOLLOWING = 0x04,
    POSITION_CONTAINS = 0x08,
    POSITION_CONTAINED_BY = 0x10;

var userSelectNone =
        ( NS.UA.cssProps[ 'user-select' ] === '-moz-user-select' ) ?
            '-moz-none' : 'none';

/**
    Class: O.View

    Extends: O.Object

    The O.View class is the basis for any graphical part of an application.

    ### Using the View system ###

    The View class is likely to be the most commonly subclassed class in your
    application. In the same way that an HTML document consists of a tree of
    element nodes, the UI for an application built with the O library will
    consist of a tree of O.View instances. In idiomatic O, it is common to
    include the behaviour of the view as well as the render method (equivalent
    to the template in other systems) in the class definition.

    Following another idiomatic pattern of the O libary, the standard
    constructor for O.View takes a single argument which is used to extend and
    override existing methods and properties on the instance; essentially
    creating an instance of an anonymous subclass. For one-off views, this is
    often the easiest thing to do. For example:

        new O.View({
            className: function () {
                return 'MessageView' +
                    ( this.get( 'isImportant' ) ? ' important' : '' );
            }.property( 'isImportant' ),
            draw: function ( layer, Element, el ) {
                return [
                    el( 'h1#title', {
                        text: O.bind( 'title', this )
                    }),
                    el( 'p.normal', {
                        html: O.bind( 'content', this )
                    }),
                    el( 'footer', [
                        'For more information, please go to',
                        el( 'a', { href: 'http://www.opera.com/' }, [
                            'opera.com'
                        ])
                    ])
                ];
            }
        });

    If the view type is going to be reused, you should create a subclass
    instead; this is more efficient.

    ### The rendering pipeline ###

    A view is automatically rendered just before being inserted into the
    document; it is rare you will need to call <O.View#render> from custom code,
    unless writing views with custom insertion methods. The role of the render
    method is to ensure that the underlying DOM representation of the view has
    been created; by default it creates the layer (the root DOM node for the
    view), and passes it to the <O.View#draw> method. This is the one you will
    normally override to draw your own view. You must ensure that as part of
    this, all child views are also rendered; the default version of the method
    is simply to call render() on each of the child views and append them to the
    layer.

    There are two properties on every view instance representing its current
    render state. The `isRendered` property indicates whether render() has yet
    been called. The `isInDocument` property indicates whether the layer has
    been inserted into the document (so is part of the live/visible DOM).
    Methods on the view instance are called before and after adding or removing
    the layer to the document; it is occassionally required to run some code at
    one of these stages, for example the scroll position on a DOM element is
    lost when it is removed from the document, and needs to be restored
    immediately after the element is reappended to the document. If you do
    override one of these properties, be sure to call the parent method inside
    your code.

    A View corresponds to a single DOM node; you will often then draw to this,
    both directly and by inserting sub-views. You are free to implement the
    <#draw> method which does this in any way you like, however it is
    recommended to make use of <O.Element.create> to write your template in
    JavaScript, as in the example above. This makes it easy to use bindings and
    insert other subviews directly.

    ### Updating for changes ###

    A view is often used to represent a piece of mutable data. In this case, you
    want to keep the view in sync with the underlying data. This is easy to do
    using standard bindings; you can bind any property of the DOM. You can also
    include sub views just like normal DOM children. For form controls, which
    need to synchronise in two directions, use the wrapper views, like
    O.CheckboxView etc. For example:

        new O.View({
            draw: function ( layer, Element, el ) {
                var content = this.get( 'content' );
                return [
                    el( 'h1#title', {
                        className: O.bind( 'isDone', content,
                                function ( isDone ) {
                            return isDone ? 'done' : 'todo';
                        }),
                        text: O.bind( 'title', content )
                    }),
                    el( 'p', [
                        new CheckboxView({
                            value: O.bind( 'isDone', content ),
                            label: O.bind( 'description', content )
                        })
                    ])
                ];
            }
        });

    The other approach is to observe events and manually update the DOM.

    ### Events ###

    All events are handled very efficiently by delegation. You can register
    methods that should be invoked on certain events by calling the
    <Function#on> method. For example:

        new O.View({
            alert: function ( event ) {
                window.alert( 'You clicked the view!' );
            }.on( 'click' )
        });

    The arguments to the 'on' method specify the events that should trigger the
    method. The event object is passed as the sole parameter to the method when
    this happens. It is perfectly fine for more than one method on the object to
    handle the same event, although note in this case there is no guarentee on
    the order they will be triggered. Unless event.stopPropagation() is called,
    the event will propagate to the object specified as the nextEventTarget
    property on the object, by default the parent view.

    ### Layout ###

    The 'id' and 'className' property of the view correspond to the 'id' and
    'class' property on the underlying DOM node. The id must not change after
    the view has been rendered. The className property may be changed as
    frequently as you like; the underlying DOM node will be kept in sync. It is
    common to make className a computed property that updates depending on the
    state of the view.
*/

var renderView = function ( view ) {
    return view.render().get( 'layer' );
};

var View = NS.Class({

    Extends: NS.Object,

    /**
        Property: O.View#parentView
        Type: O.View|null

        The parent view of this view.
    */

    /**
        Property: O.View#childViews
        Type: Array.<O.View>

        An array of the child views of this view.
    */

    /**
        Property: O.View#syncOnlyInDocument
        Type: Boolean
        Default: true

        If true, all bindings to the view will be suspended when the view is not
        in the document, and resumed/resynced just before being inserted into
        the document for efficiency.
    */
    syncOnlyInDocument: true,

    init: function ( mixin ) {
        this._needsRedraw = null;

        this.parentView = null;
        this.isRendered = false;
        this.isInDocument = false;

        View.parent.init.call( this, mixin );

        var children = this.get( 'childViews' ) || ( this.childViews = [] ),
            l = children.length;
        while ( l-- ) {
            children[l].set( 'parentView', this );
        }
        if ( this.get( 'syncOnlyInDocument' ) ) {
            this.suspendBindings();
        }
    },

    destroy: function () {
        if ( this.get( 'isInDocument' ) ) {
            throw new Error( 'Cannot destroy a view in the document' );
        }

        var children = this.get( 'childViews' ),
            l = children.length;
        while ( l-- ) {
            children[l].destroy();
        }
        if ( this.get( 'isRendered' ) ) {
            this.willDestroyLayer( this.get( 'layer' ) );
        }
        this.clearPropertyCache();
        View.parent.destroy.call( this );
    },

    // --- Layer ---

    /**
        Property: O.View#isRendered
        Type: Boolean

        Has the <O.View#render> method been called yet?
    */

    /**
        Property: O.View#isInDocument
        Type: Boolean

        Is the view currently part of the document DOM tree hierarchy?
    */

    /**
        Property: O.View#id
        Type: String

        The id of the view. Automatically assigned if not overridden. Will be
        set as the id of the underlying DOM node.
    */
    id: function () {
        return 'v' + UID++;
    }.property(),

    /**
        Property: O.View#className
        Type: String|undefined
        Default: undefined

        If defined, this is set as the class attribute on the underlying DOM
        node. Any change to this property will be propagated to the DOM node.
    */
    className: undefined,

    /**
        Property: O.View#layerTag
        Type: String
        Default: 'div'

        The node type to use for the layer representing this view.
    */
    layerTag: 'div',

    /**
        Property: O.View#layer
        Type: Element

        The underlying DOM node for this layer.
    */
    layer: function () {
        var layer = NS.Element.create( this.get( 'layerTag' ), {
            id: this.get( 'id' ),
            className: this.get( 'className' ),
            style: Object.toCSSString( this.get( 'layerStyles' ) ),
            unselectable: this.get( 'allowTextSelection' ) ? undefined : 'on'
        });
        this.didCreateLayer( layer );
        return layer;
    }.property(),

    /**
        Method: O.View#didCreateLayer

        Called immediately after the layer is created. By default does nothing.

        Parameters:
            layer - {Element} The DOM node.
    */
    didCreateLayer: function ( layer ) {},

    /**
        Method: O.View#willDestroyLayer

        Called immediately before the layer is destroyed.

        Parameters:
            layer - {Element} The DOM node.
    */
    willDestroyLayer: function ( layer ) {
        this.set( 'isRendered', false );
    },

    /**
        Method: O.View#willEnterDocument

        Called immediately before the layer is appended to the document.

        Returns:
            {O.View} Returns self.
    */
    willEnterDocument: function () {
        if ( this.get( 'syncOnlyInDocument' ) ) {
            this.resumeBindings();
        }

        if ( this._needsRedraw ) {
            this.redraw();
        }

        var children = this.get( 'childViews' ),
            l = children.length;
        while ( l-- ) {
            children[l].willEnterDocument();
        }

        return this;
    },

    /**
        Method: O.View#didEnterDocument

        Called immediately after the layer is appended to the document.

        Returns:
            {O.View} Returns self.
    */
    didEnterDocument: function () {
        // If change was made since willEnterDocument, will not be
        // flushed, so add redraw to render queue.
        if ( this._needsRedraw ) {
            NS.RunLoop.queueFn( 'render', this.redraw, this );
        }
        this.set( 'isInDocument', true );

        NS.ViewEventsController.registerActiveView( this );

        this.computedPropertyDidChange( 'pxLayout' );

        var children = this.get( 'childViews' ),
            l = children.length;
        while ( l-- ) {
            children[l].didEnterDocument();
        }

        return this;
    },

    /**
        Method: O.View#willLeaveDocument

        Called immediately before the layer is removed from the document.

        Returns:
            {O.View} Returns self.
    */
    willLeaveDocument: function () {
        this.set( 'isInDocument', false );

        NS.ViewEventsController.deregisterActiveView( this );

        var children = this.get( 'childViews' ),
            l = children.length;
        while ( l-- ) {
            children[l].willLeaveDocument();
        }

        return this;
    },

    /**
        Method: O.View#didLeaveDocument

        Called immediately after the layer is removed from the document.

        Returns:
            {O.View} Returns self.
    */
    didLeaveDocument: function () {
        var children = this.get( 'childViews' ),
            l = children.length;
        while ( l-- ) {
            children[l].didLeaveDocument();
        }
        if ( this.get( 'syncOnlyInDocument' ) ) {
            this.suspendBindings();
        }
        return this;
    },

    // --- Event triage ---

    /**
        Property: O.View#nextEventTarget
        Type: O.EventTarget|null

        The next object to bubble events to. Unless overriden, this will be the
        parent view of this view.
    */
    nextEventTarget: function () {
        return this.get( 'parentView' );
    }.property( 'parentView' ),

    /**
        Method: O.View#handleEvent

        Handler for native DOM events where this view class is registered as the
        handler. If you need to observe a DOM event which for performance
        reasons is not normally observed by the root view, for example
        mousemove, you should register the view object *directly* as the
        handler, e.g.

            layer.addEventListener( 'mouseover', this, false );

        The handleEvent method will then cause the event to be fired in the
        normal fashion on the object.

        Parameters:
            event - {Event} The DOM event object.
    */
    handleEvent: function ( event ) {
        NS.ViewEventsController.handleEvent( event );
    },

    // --- Behaviour ---

    /**
        Property: O.View#isDraggable
        Type: Boolean
        Default: false

        Is this a draggable view? Note, to make the view draggable, you should
        include <O.Draggable> in your subclass rather than just setting this to
        true.
    */
    isDraggable: false,

    /**
        Property: O.View#allowTextSelection
        Type: Boolean
        Default: false

        May text be selected by the user inside this view? Can be overridden
        inside subviews.
   */
    allowTextSelection: false,

    _cancelTextSelection: function ( event ) {
        if ( !this.get( 'allowTextSelection' ) ) {
            event.preventDefault();
        }
        event.stopPropagation();
    }.on( 'selectstart' ),

    // --- Layout ---

    /**
        Property: O.View#positioning
        Type: String
        Default: 'relative'

        What type of positioning to use to layout the DOM node of this view.
        Will normally be either 'relative' (the default) or 'absolute'.
   */
    positioning: 'relative',

    /**
        Property: O.View#layout
        Type: Object
        Default: {}

        The CSS properties to apply to the view's layer. Any number values are
        presumed to be in 'px', any string values are presumed to have an
        appropriate unit suffix.
    */
    layout: {},

    /**
        Property: O.View#layerStyles
        Type: Object

        An object representing all of the CSS styles set on the view DOM node,
        as calculated from various other properties on the view. These are
        recalculated, and the DOM node is updated, if any of the dependent
        properties change.
    */
    layerStyles: function () {
        var allowTextSelection = this.get( 'allowTextSelection' );
        return NS.extend({
            position: this.get( 'positioning' ),
            cursor: allowTextSelection ? 'auto' : undefined,
            userSelect: allowTextSelection ? 'text' : userSelectNone
        }, this.get( 'layout' ) );
    }.property( 'layout', 'allowTextSelection', 'positioning' ),

    /**
        Method: O.View#render

        Ensure the view is rendered. Has no effect if the view is already
        rendered.

        Returns:
            {O.View} Returns self.
    */
    render: function () {
        if ( !this.get( 'isRendered' ) ) {
            // render() called just before inserting in doc, so should
            // resume bindings early to ensure initial render is correct.
            if ( this.get( 'syncOnlyInDocument' ) ) {
                this.resumeBindings();
            }
            this.set( 'isRendered', true );
            var Element = NS.Element,
                prevView = Element.forView( this ),
                layer = this.get( 'layer' ),
                children = this.draw( layer, Element, Element.create );
            if ( children ) {
                Element.appendChildren( layer, children );
            }
            Element.forView( prevView );
        }
        return this;
    },

    /**
        Method (protected): O.View#draw

        Draw the initial state of the view. You should override this method to
        draw your views. By default, it simply calls <O.View#render> on all
        child views and appends them to the view's DOM node.
    */
    draw: function ( layer, Element, el ) {
        return this.get( 'childViews' ).map( renderView );
    },

    /**
        Property (private): O.View#_needsRedraw
        Type: Array|null

        Array of tuples for properties that need a redraw. Each tuple has the
        property name as the first item and the old value as the second.
    */

    /**
        Method: O.View#propertyNeedsRedraw

        Adds a property to the needsRedraw queue and if in document, schedules
        the O.View#redraw method to be run in the next 'render' phase of the run
        loop. This method is automatically called when the className or
        layerStyles properties change. If the view needs to be redrawn when
        other properties change too, override this method and add the other
        properties as observees as well.

        Parameters:
            _             - {*} Unused
            layerProperty - {String} The name of the property needing a redraw
            oldProp       - {*} The previous value of the property
    */
    propertyNeedsRedraw: function ( _, layerProperty, oldProp ) {
        if ( this.get( 'isRendered' ) ) {
            var needsRedraw = this._needsRedraw || ( this._needsRedraw = [] ),
                i, l;
            for ( i = 0, l = needsRedraw.length; i < l; i += 1 ) {
                if ( needsRedraw[i][0] === layerProperty ) {
                    return;
                }
            }
            needsRedraw[l] = [
                layerProperty,
                oldProp
            ];
            if ( this.get( 'isInDocument' ) ) {
                NS.RunLoop.queueFn( 'render', this.redraw, this );
            }
        }
    }.observes( 'className', 'layerStyles' ),

    /**
        Method: O.View#redraw

        Updates the rendering of the view to account for any changes in the
        state of the view. By default, just calls
        `this.redraw<Property>( layer, oldValue )` for each property that has
        been passed to <O.View#propertyNeedsRedraw>.

        Returns:
            {O.View} Returns self.
    */
    redraw: function () {
        var needsRedraw = this._needsRedraw,
            layer, i, l, prop;
        if ( needsRedraw && !this.isDestroyed && this.get( 'isRendered' ) ) {
            layer = this.get( 'layer' );
            this._needsRedraw = null;
            for ( i = 0, l = needsRedraw.length; i < l; i += 1 ) {
                prop = needsRedraw[i];
                this[ 'redraw' + prop[0].capitalise() ]( layer, prop[1] );
            }
        }
        return this;
    },

    /**
        Method: O.View#redrawLayer

        Redraws the entire layer by removing all existing children and then
        calling <O.View#draw> again. Warning: it is only safe to use this
        implementation if the view has no child views and no bindings to any of
        its DOM elements.

        Parameters:
            layer - {Element} The view's layer.
    */
    redrawLayer: function ( layer ) {
        var Element = NS.Element,
            prevView = Element.forView( this ),
            childViews = this.get( 'childViews' ),
            l = childViews.length,
            node, view;

        while ( l-- ) {
            view = childViews[l];
            this.removeView( view );
            view.destroy();
        }
        while ( node = layer.lastChild ) {
            layer.removeChild( node );
        }
        Element.appendChildren( layer,
            this.draw( layer, Element, Element.create )
        );
        Element.forView( prevView );
    },

    /**
        Method: O.View#redrawClassName

        Sets the className on the layer to match the className property of the
        view. Called automatically when the className property changes.

        Parameters:
            layer - {Element} The view's layer.
    */
    redrawClassName: function ( layer ) {
        layer.className = this.get( 'className' );
    },

    /**
        Method: O.View#redrawLayerStyles

        Sets the style attribute on the layer to match the layerStyles property
        of the view. Called automatically when the layerStyles property changes.

        Parameters:
            layer - {Element} The view's layer.
    */
    redrawLayerStyles: function ( layer ) {
        layer.style.cssText = Object.toCSSString( this.get( 'layerStyles' ) );
        this.didResize();
    },

    // --- Dimensions ---

    /**
        Method: O.View#parentViewDidResize

        Called automatically whenever the parent view resizes. Rather than
        override this method, you should normally observe the <O.View#pxLayout>
        property if you're interested in changes to the view size.
    */
    parentViewDidResize: function () {
        // px dimensions only have a defined value when part of the document,
        // so if we're not visible, let's just ignore the change.
        if ( this.get( 'isInDocument' ) ) {
            this.didResize();
        }
    },

    /**
        Method: O.View#didResize

        Called when the view may have resized. This will invalidate the pxLayout
        properties and inform child views.
    */
    didResize: function () {
        this.computedPropertyDidChange( 'pxLayout' );
        var children = this.get( 'childViews' ),
            l = children.length;
        while ( l-- ) {
            children[l].parentViewDidResize();
        }
    },

    /**
        Property: O.View#scrollTop
        Type: Number

        The vertical scroll position in pixels.
    */
    scrollTop: 0,

    /**
        Property: O.View#scrollLeft
        Type: Number

        The horizontal scroll position in pixels.
    */
    scrollLeft: 0,

    /**
        Property: O.View#pxLayout
        Type: Object

        An object specifying the layout of the view in pixels. Properties:
        - top: The y-axis offset in pixels of the top edge of the view from the
          top edge of its parent's view.
        - left: The x-axis offset in pixels of the left edge of the view from
          the left edge of its parent's view.
        - width: The width of the view in pixels.
        - height: The height of the view in pixels.
    */
    pxLayout: function () {
        return  {
            top: this.get( 'pxTop' ),
            left: this.get( 'pxLeft' ),
            width: this.get( 'pxWidth' ),
            height: this.get( 'pxHeight' )
        };
    }.property(),

    /**
        Property: O.View#pxTop
        Type: Number

        The position in pixels of the top edge of the layer from the top edge of
        the parent view's layer.
    */
    pxTop: function () {
        if ( !this.get( 'isInDocument' ) ) {
            return 0;
        }
        var parent = this.get( 'parentView' ).get( 'layer' ),
            parentOffsetParent = parent.offsetParent,
            layer = this.get( 'layer' ),
            offset = 0;
        do {
            if ( layer === parentOffsetParent ) {
                offset -= parent.offsetTop;
                break;
            }
            offset += layer.offsetTop;
        } while ( layer && ( layer = layer.offsetParent ) !== parent );
        return offset;
    }.property( 'pxLayout' ),

    /**
        Property: O.View#pxLeft
        Type: Number

        The position in pixels of the left edge of the layer from the left edge
        of the parent view's layer.
    */
    pxLeft: function () {
        if ( !this.get( 'isInDocument' ) ) {
            return 0;
        }
        var parent = this.get( 'parentView' ).get( 'layer' ),
            parentOffsetParent = parent.offsetParent,
            layer = this.get( 'layer' ),
            offset = 0;
        do {
            if ( layer === parentOffsetParent ) {
                offset -= parent.offsetLeft;
                break;
            }
            offset += layer.offsetLeft;
        } while ( layer && ( layer = layer.offsetParent ) !== parent );
        return offset;
    }.property( 'pxLayout' ),

    /**
        Property: O.View#pxWidth
        Type: Number

        The width of the view's layer in pixels.
    */
    pxWidth: function () {
        return this.get( 'isInDocument' ) ?
            this.get( 'layer' ).offsetWidth : 0;
    }.property( 'pxLayout' ),

    /**
        Property: O.View#pxHeight
        Type: Number

        The height of the view's layer in pixels.
    */
    pxHeight: function () {
        return this.get( 'isInDocument' ) ?
            this.get( 'layer' ).offsetHeight : 0;
    }.property( 'pxLayout' ),

    /**
        Property: O.View#visibleRect
        Type: Object

        Using a pixel coordinate system with (0,0) at the top left corner of
        this view's layer, returns the rectangle (x, y, width, height) of this
        layer which is currently visible on screen.

        For performance reasons, the default implementation does not accurately
        take into account clipping by parent view; you should must include
        <O.TrueVisibleRect> in the view if you need this to be accurate.
    */
    visibleRect: function () {
        return {
            x: this.get( 'scrollLeft' ),
            y: this.get( 'scrollTop' ),
            width: this.get( 'pxWidth' ),
            height: this.get( 'pxHeight' )
        };
    }.property( 'scrollLeft', 'scrollTop', 'pxLayout' ),

    /**
        Method: O.View#getPositionRelativeTo

        Get the offset of this view relative to another view. Both views should
        be currently in the document.

        Parameters:
            view - {O.View} The view to get the offset from.

        Returns:
            {Object} An object with 'top' and 'left' properties, each being the
            number of pixels this view is offset from the given view.
    */
    getPositionRelativeTo: function ( view ) {
        var getPosition = NS.Element.getPosition,
            selfPosition = getPosition( this.get( 'layer' ) ),
            viewPosition = getPosition( view.get( 'layer' ) );
        selfPosition.top -= viewPosition.top - view.get( 'scrollTop' );
        selfPosition.left -= viewPosition.left - view.get( 'scrollLeft' );
        return selfPosition;
    },

    // --- Insertion and deletion ---

    /**
        Method: O.View#insertView

        Insert a new child view. If the view already has a parent view, it will
        be removed from that view first.

        Parameters:
            view       - {O.View} The new child view to insert.
            relativeTo - {(Element|O.View)} (optional) The DOM node or child
                         view to insert the new child view's layer relative to.
                         If not supplied, or null/undefined, the child will be
                         inserted relative to this view's layer.
            where      - {String} (optional) Specifies where the view's layer
                         should be placed in the DOM tree relative to the
                         relativeView node. Defaults to 'bottom' (appended to
                         node), may also be 'before', 'after' or 'top'.

        Returns:
            {O.View} Returns self.
    */
    insertView: function ( view, relativeTo, where ) {
        var oldParent = view.get( 'parentView' ),
            childViews = this.get( 'childViews' ),
            index, isInDocument, layer, parent, before;

        if ( oldParent === this ) {
            return this;
        }

        if ( !relativeTo && ( where === 'before' || where === 'after' ) ) {
            this.get( 'parentView' ).insertView( view, this, where );
            return this;
        }

        if ( oldParent ) {
            oldParent.removeView( view );
        }
        view.set( 'parentView', this );

        if ( relativeTo instanceof View ) {
            index = childViews.indexOf( relativeTo );
            index = ( index > -1 ) ?
                where === 'before' ?
                    index :
                    index + 1 :
                childViews.length;
            childViews.splice( index, 0, view );
            relativeTo = relativeTo.get( 'layer' );
        } else {
            if ( where === 'top' ) {
                childViews.unshift( view );
            } else {
                childViews.push( view );
            }
        }

        if ( this.get( 'isRendered' ) ) {
            if ( !relativeTo ) {
                relativeTo = this.get( 'layer' );
                if ( where === 'before' || where === 'after' ) {
                    where = '';
                }
            }
            isInDocument = this.get( 'isInDocument' );
            parent = ( where === 'before' || where === 'after' ) ?
                relativeTo.parentNode : relativeTo;
            before = ( where === 'before' ) ? relativeTo :
                ( where === 'top' ) ? relativeTo.firstChild :
                ( where === 'after' ) ? relativeTo.nextSibling : null;
            layer = view.render().get( 'layer' );
            if ( isInDocument ) {
                view.willEnterDocument();
            }
            if ( before ) {
                parent.insertBefore( layer, before );
            } else {
                parent.appendChild( layer );
            }
            if ( isInDocument ) {
                view.didEnterDocument();
            }
        }
        this.propertyDidChange( 'childViews' );
        return this;
    },

    /**
        Method: O.View#replaceView

        Replaces one child view with another. If the new view already has a
        parent view, it will be removed from that view first. The new view will
        be inserted in the exact same position in the DOM as the view it is
        replacing. If the oldView supplied is not actually an existing child of
        this view, this method has no effect.

        Parameters:
            view    - {O.View} The new child view to insert.
            oldView - {O.View} The old child view to replace.

        Returns:
            {O.View} Returns self.
    */
    replaceView: function ( view, oldView ) {
        if ( view === oldView ) { return this; }
        var children = this.get( 'childViews' ),
            i = children.indexOf( oldView ),
            oldParent = view.get( 'parentView' );
        if ( i === -1 ) { return this; }

        if ( oldParent ) { oldParent.removeView( view ); }
        view.set( 'parentView', this );
        children.setObjectAt( i, view );

        if ( this.get( 'isRendered' ) ) {
            var isInDocument = this.get( 'isInDocument' ),
                oldLayer = oldView.get( 'layer' );
            view.render();
            if ( isInDocument ) {
                oldView.willLeaveDocument();
                view.willEnterDocument();
            }
            oldLayer.parentNode.replaceChild( view.get( 'layer' ), oldLayer );
            if ( isInDocument ) {
                view.didEnterDocument();
                oldView.didLeaveDocument();
            }
        }

        oldView.set( 'parentView', null );
        this.propertyDidChange( 'childViews' );
        return this;
    },

    /**
        Method: O.View#removeView

        Removes a child view from this view. Has no effect if the view passed as
        an argument is not a child view of this view.

        Parameters:
            view - {O.View} The child view to remove.

        Returns:
            {O.View} Returns self.
    */
    removeView: function ( view ) {
        var children = this.get( 'childViews' ),
            i = children.lastIndexOf( view ),
            isInDocument, layer;

        if ( i === -1 ) {
            return this;
        }

        if ( this.get( 'isRendered' ) ) {
            isInDocument = this.get( 'isInDocument' );
            layer = view.get( 'layer' );
            if ( isInDocument ) {
                view.willLeaveDocument();
            }
            layer.parentNode.removeChild( layer );
            if ( isInDocument ) {
                view.didLeaveDocument();
            }
        }
        children.splice( i, 1 );
        view.set( 'parentView', null );
        this.propertyDidChange( 'childViews' );
        return this;
    },

    detach: function () {
        var parentView = this.get( 'parentView' );
        if ( parentView ) {
            parentView.removeView( this );
        }
        return this;
    },

    // --- Tree position and searching ---

    /**
        Method: O.View#compareViewTreePosition

        Returns a constant giving the relative position in the view tree (as
        specified by the parentView/childViews parameters) of this view compared
        to the view given as a parameter. The constants are:

            O.View.POSITION_SAME         - They are the same view instance.
            O.View.POSITION_DISCONNECTED - This view is not in the same tree as
                                           the given view.
            O.View.POSITION_PRECEDING    - This view is before the given view in
                                           the DOM tree
            O.View.POSITION_FOLLOWING    - This view is after the given view in
                                           the DOM tree
            O.View.POSITION_CONTAINS     - This view contains the given view.
            O.View.POSITION_CONTAINED_BY - This view is contained by the given
                                           view.

        Parameters:
            view - {O.View} The view to compare position to.

        Returns:
            {Number} Relative position.
    */
    compareViewTreePosition: function ( b ) {
        if ( this === b ) {
            return POSITION_SAME;
        }

        var a = this,
            aParents = [a],
            bParents = [b],
            parent = a,
            al, bl, children, l, view;

        while ( parent = parent.get( 'parentView' ) ) {
            if ( parent === b ) {
                return POSITION_CONTAINED_BY;
            }
            aParents.push( parent );
        }
        parent = b;
        while ( parent = parent.get( 'parentView' ) ) {
            if ( parent === a ) {
                return POSITION_CONTAINS;
            }
            bParents.push( parent );
        }

        al = aParents.length;
        bl = bParents.length;
        while ( al-- && bl-- ) {
            if ( ( a = aParents[ al ] ) !== ( b = bParents[ bl ] ) ) {
                parent = aParents[ al + 1 ];
                if ( !parent ) {
                    return POSITION_DISCONNECTED;
                } else {
                    children = parent.get( 'childViews' );
                    l = children.length;
                    while ( l-- ) {
                        view = children[l];
                        if ( view === b ) {
                            return POSITION_PRECEDING;
                        }
                        if ( view === a ) {
                            return POSITION_FOLLOWING;
                        }
                    }
                    break;
                }
            }
        }

        return POSITION_DISCONNECTED;
    },

    /**
        Method: O.View#getParent

        Finds the nearest ancestor in the view hierarchy which is an instance of
        a particular view class.

        Parameters:
            Type - {O.Class} A view type (i.e. a subclass of O.View).

        Returns:
            {(O.View|null)} Returns the nearest parent view of the given type or
            null if none of the view's ancestors are of the required type.
    */
    getParent: function ( Type ) {
        var parent = this;
        do {
            parent = parent.get( 'parentView' );
        } while ( parent && !( parent instanceof Type ) );
        return parent || null;
    }
});

// Expose Globals:

View.LAYOUT_FILL_PARENT = {
    top: 0,
    left: 0,
    bottom: 0,
    right: 0
};

View.POSITION_SAME = POSITION_SAME;
View.POSITION_DISCONNECTED = POSITION_DISCONNECTED;
View.POSITION_PRECEDING = POSITION_PRECEDING;
View.POSITION_FOLLOWING = POSITION_FOLLOWING;
View.POSITION_CONTAINS = POSITION_CONTAINS;
View.POSITION_CONTAINED_BY = POSITION_CONTAINED_BY;

View.peekId = function () {
    return 'v' + UID;
}

NS.View = View;

}( this.O ) );