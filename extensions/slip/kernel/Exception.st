"Slip kernel: exceptions, step 1. An exception that is signalled ends the evaluation and is
reported in the Workspace. Handlers (on:do:), resumption and the debugger come in step 3."!

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

!Exception methodsFor: 'accessing'!
messageText
	^messageText ifNil: [self description]
!
messageText: aString
	messageText := aString
!
description
	^self class name
! !

!Exception methodsFor: 'signalling'!
signal
	<primitive: 'signalUnhandled'>
	^nil
!
signal: aString
	messageText := aString.
	^self signal
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
