"Slip kernel: exceptions, as ANSI has them, and the contexts they work on. A handler is an
on:do: context, found by walking the senders from where the exception was signalled; ensure:
and ifCurtailed: are unwind contexts, whose blocks run when a return passes them. An exception
no handler takes stops its process, and the Workspace offers the debugger."!

!Exception class methodsFor: 'signalling'!
new
	^self basicNew
!
signal
	^self new signal
!
signal: aString
	^self new signal: aString
! !

!Exception class methodsFor: 'exception selection'!
handles: anException
	^anException isKindOf: self
!
, anExceptionClass
	^ExceptionSet new add: self; add: anExceptionClass; yourself
! !

!Exception methodsFor: 'accessing'!
messageText
	^messageText ifNil: [self description]
!
messageText: aString
	messageText := aString
!
description
	^self class name
!
signalContext
	^signalContext
!
signalerContext
	| context |
	context := signalContext.
	[context notNil and: [context receiver == self]] whileTrue: [context := context sender].
	^context
! !

!Exception methodsFor: 'testing'!
isResumable
	^true
! !

!Exception methodsFor: 'signalling'!
signal
	signalContext := thisContext.
	handlerContext := nil.
	outerContext := nil.
	^self searchFrom: thisContext sender
!
signal: aString
	messageText := aString.
	^self signal
!
defaultAction
	<primitive: 'unhandled'>
	^nil
! !

!Exception methodsFor: 'handling'!
return: anObject
	handlerContext ifNil: [^Error new signal: 'An exception that no handler took cannot return.'].
	^handlerContext return: anObject
!
return
	^self return: nil
!
retry
	handlerContext ifNil: [^Error new signal: 'An exception that no handler took cannot retry.'].
	thisContext unwindTo: handlerContext.
	^handlerContext primRestart
!
retryUsing: aBlock
	handlerContext ifNil: [^Error new signal: 'An exception that no handler took cannot retry.'].
	thisContext unwindTo: handlerContext.
	handlerContext receiver: aBlock.
	^handlerContext primRestart
!
resume: anObject
	self isResumable ifFalse: [^Error new signal: self class name, ' is not resumable.'].
	^self resumeUnchecked: anObject
!
resume
	^self resume: nil
!
pass
	handlerContext ifNil: [^self resumeUnchecked: self defaultAction].
	^self searchFrom: handlerContext sender
!
outer
	"Like pass, but a resumption comes back here, as the value of outer."
	| previous |
	previous := outerContext.
	outerContext := thisContext.
	^self pass
!
signalIn: aContext
	"Not ANSI: signal this exception again, from the handler's context outward."
	^self searchFrom: aContext
! !

!Exception methodsFor: 'private'!
searchFrom: aContext
	| context |
	context := aContext.
	[context isNil] whileFalse: [
		(context isHandlerContext and: [(context tempAt: 3) == true and: [(context tempAt: 1) handles: self]])
			ifTrue: [^self handleIn: context].
		context := context sender].
	^self resumeUnchecked: self defaultAction
!
handleIn: aContext
	| value |
	handlerContext := aContext.
	aContext tempAt: 3 put: false.
	value := [(aContext tempAt: 2) cull: self] ensure: [aContext tempAt: 3 put: true].
	^self return: value
!
resumeUnchecked: anObject
	| context |
	outerContext isNil
		ifTrue: [context := signalContext]
		ifFalse: [
			context := outerContext.
			outerContext := context tempAt: 1].
	^context return: anObject
! !

!Exception methodsFor: 'printing'!
printOn: aStream
	aStream nextPutAll: self class name.
	messageText isNil ifFalse: [aStream nextPutAll: ': '; nextPutAll: messageText]
! !

!Error methodsFor: 'testing'!
isResumable
	^false
! !

!Notification methodsFor: 'signalling'!
defaultAction
	^nil
! !

!Halt methodsFor: 'accessing'!
description
	^'Halt'
! !

!ZeroDivide methodsFor: 'accessing'!
description
	^'Division by zero'
! !

!ExceptionSet methodsFor: 'exception selection'!
add: anExceptionClass
	exceptions isNil ifTrue: [exceptions := OrderedCollection new].
	exceptions add: anExceptionClass
!
, anExceptionClass
	^self add: anExceptionClass; yourself
!
handles: anException
	^exceptions anySatisfy: [:each | each handles: anException]
! !

!MessageNotUnderstood methodsFor: 'accessing'!
message
	^message
!
message: aMessage
	message := aMessage
!
receiver
	^receiver
!
receiver: anObject
	receiver := anObject
! !

!MessageNotUnderstood methodsFor: 'testing'!
isResumable
	^true
! !

!Message class methodsFor: 'instance creation'!
selector: aSymbol arguments: anArray
	^self new setSelector: aSymbol arguments: anArray
! !

!Message methodsFor: 'accessing'!
setSelector: aSymbol arguments: anArray
	selector := aSymbol.
	arguments := anArray
!
selector
	^selector
!
arguments
	^arguments
! !

!Message methodsFor: 'printing'!
printOn: aStream
	aStream nextPutAll: 'a Message('; print: selector; nextPut: $)
! !

!BlockClosure methodsFor: 'exceptions'!
on: exceptionClass do: handlerBlock
	"A handler context: the exception search reads its temps 1 to 3."
	<handler>
	| handlerActive |
	handlerActive := true.
	^self value
!
ensure: aBlock
	"An unwind context: a return that passes it runs aBlock, once (temps 1 and 2)."
	<unwind>
	| complete result |
	result := self value.
	complete isNil ifTrue: [
		complete := true.
		aBlock value].
	^result
!
ifCurtailed: aBlock
	"An unwind context: aBlock runs only when a return passes it before the receiver ends."
	<unwind>
	| complete result |
	result := self value.
	complete := true.
	^result
!
on: exceptionClass do: handlerBlock ensure: ensureBlock
	^[self on: exceptionClass do: handlerBlock] ensure: ensureBlock
! !

!Context methodsFor: 'accessing'!
sender
	<primitive: 'ctxSender'>
	^nil
!
receiver
	<primitive: 'ctxReceiver'>
	^nil
!
receiver: anObject
	<primitive: 'ctxReceiverPut'>
	^self primitiveFailed
!
method
	<primitive: 'ctxMethod'>
	^nil
!
tempAt: index
	<primitive: 'ctxTempAt'>
	^self error: 'This context has no temporary ', index printString
!
tempAt: index put: anObject
	<primitive: 'ctxTempAtPut'>
	^self error: 'This context has no temporary ', index printString
! !

!Context methodsFor: 'testing'!
isDead
	<primitive: 'ctxIsDead'>
	^false
!
isHandlerContext
	<primitive: 'ctxIsHandler'>
	^false
!
isUnwindContext
	<primitive: 'ctxIsUnwind'>
	^false
! !

!Context methodsFor: 'controlling'!
return: anObject
	"Returns anObject from this context, running the unwind blocks of the contexts above it."
	thisContext unwindTo: self.
	^self primReturn: anObject
!
restart
	thisContext unwindTo: self.
	^self primRestart
!
unwindTo: aContext
	"Runs the blocks of the unwind contexts from here to aContext, not including it. With nil,
	all of them."
	| context |
	context := self.
	[context notNil and: [context ~~ aContext]] whileTrue: [
		(context isUnwindContext and: [(context tempAt: 2) isNil]) ifTrue: [
			context tempAt: 2 put: true.
			(context tempAt: 1) value].
		context := context sender]
!
nonLocalReturn: anObject to: homeContext
	"The VM sends this when a block's ^ passes an unwind context on its way home."
	thisContext unwindTo: homeContext.
	^homeContext primReturn: anObject
! !

!Context methodsFor: 'private'!
primReturn: anObject
	<primitive: 'ctxReturn'>
	^self error: 'This context has already returned, so it cannot return again.'
!
primRestart
	<primitive: 'ctxRestart'>
	^self error: 'This context has already returned, so it cannot restart.'
!
primitiveFailed
	^self error: 'A primitive failed.'
! !

!Context methodsFor: 'printing'!
printOn: aStream
	aStream nextPutAll: self label
!
label
	<primitive: 'ctxLabel'>
	^'a Context'
! !
