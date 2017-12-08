var canvas;
var gl;

var leftDown = false;
var rightDown = false;
var lastMouseX = null;
var lastMouseY = null;

var mouseCoord = [];

var _pullCube = null;
var _time = null;

var _started = true;
var _firstUpdate = true;
var _supportsWebGL2 = false;


//
// start
//
// called when body loads
// sets everything up
//
function start() {

    canvas = document.getElementById("glcanvas");

    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    
    initWebGL(canvas);

    // only continue if webgl is working properly
    if (gl) {
        gl.clearColor(0.0, 0.0, 0.0, 1.0);  // Clear to black, fully opaque
        gl.clearDepth(1.0);                 // Clear everything
        gl.enable(gl.DEPTH_TEST);           // Enable depth testing
        gl.depthFunc(gl.LEQUAL);            // Near things obscure far things
        
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);

        gl.disable(gl.BLEND);

        _pullCube = new PullCube();
        _time = new Time();

        _pullCube.init();

        
        canvas.onmousedown = handleMouseDown;
        canvas.oncontextmenu = handleRightClick;
        document.onmouseup = handleMouseUp;
        document.onmousemove = handleMouseMove;
        document.onmousewheel = handleMouseWheel;
        //document.ontouchstart = handleTouchStart;
        //document.ontouchmove = handleTouchMove;
        document.body.addEventListener('touchmove', function(event) {
            event.preventDefault();
            handleTouchMove(event);
        }, false); 

        document.body.addEventListener('touchstart', function(event) {
            event.preventDefault();
            handleTouchStart(event);
        }, false); 
        
        // start the core loop cycle
        requestAnimationFrame(tick);     
    }
    else
    {
        alert("sorry, your browser/device does not support the webgl compabilities this application needs.")
    }
}


//
// render
//
// Draw the scene.
//
function render( ) 
{ 
    _pullCube.render();
}

// 
// tick
//
// core loop function
// called every frame, updates & tells the scene to render
//
function tick( currentTime )
{
    _time.update(currentTime);
    
    if( _started || _firstUpdate )
    {
        
        resize();
    
        _pullCube.update();
        
        render();
       
        _pullCube.postUpdate();

        _firstUpdate = false;
    }

    requestAnimationFrame( tick );
}


//
// initWebGL
//
// initialize WebGL, returning the GL context or null if
// WebGL isn't available or could not be initialized.
//
function initWebGL() {
    gl = null;

    try {
        gl = canvas.getContext("webgl2", { alpha: false });

        var extensions = gl.getSupportedExtensions();
        console.log(extensions);

        //gl.getExtension('WEBGL_depth_texture');
    }
    catch(e) {
    }

    if(gl)
    {
        _supportsWebGL2 = true;
    }
    else
    {
        gl = canvas.getContext("experimental-webgl", { alpha: false });
        
        var extensions = gl.getSupportedExtensions();
        console.log(extensions);

        gl.getExtension('WEBGL_depth_texture');
    }

    // If we don't have a GL context, give up now

    if (!gl) {
        alert("Unable to initialize WebGL. Your browser may not support it.");
    }
}


function initUI()
{    
    document.getElementById('fileItem').addEventListener('change', handleLoadImage, false);
}

function tutorialOff()
{
    document.getElementById("overlayTutorial").style.display = "none";
    _started = true;
}

function handleLoadImage( evt ) {
   var files = evt.target.files;
   var f = files[0];
   
   var reader = new FileReader();

    // Only process image files.
    if (f.type.match('image.*')) {
        reader.onload = (function(theFile) {
            return function(e) {
                loadVoxelTexture( e.target.result );
            };
        })(f);

        reader.readAsDataURL(f);
    }
    else if( f.name.endsWith('.vox')) { // or magica voxel files ( not perfectly atm)
        reader.onload = (function(theFile) {
            return function(e) {
                var cubeTexture = gl.createTexture();

                _pullCube.handleTextureLoaded(importMagicaVoxel( e.target.result, "" ), cubeTexture );
            };
        })(f);

        reader.readAsArrayBuffer(f);
    }
}

function loadVoxelTexture(dataSource) {
    cubeTexture = gl.createTexture();
    cubeImage = new Image();
    cubeImage.onload = function() { _pullCube.handleTextureLoaded(cubeImage, cubeTexture); }
    cubeImage.src = dataSource;
}


function saveVoxelTexture() {
    var pixels = _pullCube.getVoxTextureCPU();
    var bmpEncoder = new BMPEnc(pixels, PullCube.RT_TEX_SIZE, PullCube.RT_TEX_SIZE, true);
    var blob = new Blob([bmpEncoder.encode()], {type: "image/bmp"});

    saveAs(blob, "voxsculpt.bmp");
}


function resize() 
{

  var displayWidth  = window.innerWidth;
  var displayHeight = window.innerHeight;

  // Check if the canvas is not the same size.
  if (canvas.width  != displayWidth ||
      canvas.height != displayHeight) {

    // Make the canvas the same size
    canvas.width  = displayWidth;
    canvas.height = displayHeight;

    _pullCube.handleResize();
  }
}

function handlePointerMove(event, newX, newY, sculpt, rotate, zoomAmount) {
    

    var deltaX = newX - lastMouseX;
    var deltaY = newY - lastMouseY;

    if( zoomAmount == null )
    {
        zoomAmount = deltaX + deltaY;
    }


    if( zoomAmount )
    {
        _pullCube.handleZoom(zoomAmount);
    }
    
    if( rotate )
    {
        _pullCube.handleRotate(( deltaX / window.innerWidth ), ( deltaY / window.innerHeight ));
    }

    var nX = ( newX / window.innerWidth) * 2.0 - 1.0;
    var nY = 1.0 - ( newY / window.innerHeight ) * 2.0;       
    if( sculpt)
    {
         
        mouseCoord = vec4.fromValues( nX, nY, -1.0, 1.0);       

        _pullCube.handleToolUse(nX, nY );
    }

    _pullCube.handleMouseMove(nX,nY);


    lastMouseX = newX;
    lastMouseY = newY;
}

function handlePointerStart(event, sculpt, rotate, zoom)
{    
    if( sculpt )
    {
        var nX = ( (lastMouseX / window.innerWidth) ) * 2.0 - 1.0;
        var nY = 1.0 - ( lastMouseY / ( window.innerHeight ) ) * 2.0;
        mouseCoord = vec4.fromValues( nX, nY, -1.0, 1.0);    

        handlePointerMove(event, lastMouseX, lastMouseY, true, false, 0);

        currSculpting = true;
    }
    
}

function handleMouseDown(event) {
    
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;

    var rightclick;
    if (event.which) rightclick = (event.which == 3);
    else if (event.button) rightclick = (event.button == 2);

    if( rightclick )
    {
        rightDown = true;
    }
    else
    {
        leftDown = true;
    }
    
    var altKey = event.altKey == 1;
    
    var sculpting = false;
    var rotating = (!rightclick);
    var zooming = (rightclick);
    
    
    handlePointerStart(event, 
        sculpting,
        rotating,
        zooming
    );
}

function handleMouseUp(event) {
    var rightclick;
    if (event.which) rightclick = (event.which == 3);
    else if (event.button) rightclick = (event.button == 2);

    var altKey = event.altKey == 1;
    
    var sculpting = false;
    var rotating = (!rightclick);
    var zooming = (rightclick);
    
    if( !rightclick )
    {
        leftDown = false;
    }
    else
    {
        rightDown = false;
    }

    if( sculpting )
    {
        currSculpting = false;
    }
}

function handleMouseMove(event) {


    var altKey = event.altKey == 1;

    var sculpting = false;
    var rotating = (leftDown);
    var zooming = (rightDown);

    handlePointerMove(event, event.clientX, event.clientY, 
    sculpting, 
    rotating, 
    zooming ? null : 0
    );
}


function handleMouseWheel(event) 
{
    _pullCube.handleZoom( event.wheelDelta / 120 );
}

function handleRightClick(event) {
    event.preventDefault();
    return false;
}

var touches = []

function handleTouchStart(event) {
    touches = event.touches;

    

    var rightclick = false;

    if( touches.length == 1 )
    {
        lastMouseX = touches[0].clientX;
        lastMouseY = touches[0].clientY;
    }
    else if( touches.length == 2 )
    {
        rightclick = true;
        lastMouseX = (touches[1].clientX + touches[0].clientX) / 2.0;
        lastMouseY = (touches[1].clientY + touhces[0].clientY) / 2.0;
    }

    lastTouchDist = -1;

    handlePointerStart(event, 
    touches.length == 1,
    touches.length == 2,
    touches.length == 2);
}

var lastTouchDist = -1;

function handleTouchMove(event) {
    touches = event.touches;

    var newX, newY;

    if( touches.length  == 1 )
    {
        leftDown = true;
        rightDown = false;
        newX = touches[0].clientX / 1.0;
        newY = touches[0].clientY / 1.0;
    }
    else if ( touches.length == 2 )
    {
        leftDown = false;
        rightDown = true;
        newX = touches[0].clientX; //(touches[1].clientX + touches[0].clientX) / 2.0;
        newY = touches[0].clientY; //(touches[1].clientY + touhces[0].clientY) / 2.0;
    }
    else
    {
        leftDown = false;
        rightDown = false;
        newX = lastMouseX;
        newY = lastMouseY;

        return;
    }

    var zoomDelta = 0;

    if( touches.length == 2 )
    {
        var distX = touches[1].clientX - touches[0].clientX;
        var distY = touches[1].clientY - touches[0].clientY;

        var touchDist = Math.sqrt(distX * distX + distY * distY);

        if( lastTouchDist >= 0)
        {
            zoomDelta = touchDist - lastTouchDist;
        }

        lastTouchDist = touchDist;
    }

    handlePointerMove(event, newX, newY, 
        touches.length == 1,
        touches.length == 2,
        zoomDelta
    );

    return false;
}
