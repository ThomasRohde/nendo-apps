"Slip kernel: BlockClosure. on:do:, ensure: and ifCurtailed: are with the exceptions, in Exception.st."!

!BlockClosure methodsFor: 'evaluating'!
value
	<primitive: 'blockValue'>
	^self numArgsError: 0
!
value: first
	<primitive: 'blockValue'>
	^self numArgsError: 1
!
value: first value: second
	<primitive: 'blockValue'>
	^self numArgsError: 2
!
value: first value: second value: third
	<primitive: 'blockValue'>
	^self numArgsError: 3
!
value: first value: second value: third value: fourth
	<primitive: 'blockValue'>
	^self numArgsError: 4
!
valueWithArguments: anArray
	<primitive: 'blockValueWithArgs'>
	^self numArgsError: anArray size
!
cull: first
	^self numArgs = 0 ifTrue: [self value] ifFalse: [self value: first]
!
cull: first cull: second
	self numArgs = 0 ifTrue: [^self value].
	self numArgs = 1 ifTrue: [^self value: first].
	^self value: first value: second
! !

!BlockClosure methodsFor: 'accessing'!
numArgs
	<primitive: 'blockNumArgs'>
	^0
!
numArgsError: count
	^self error: 'This block takes ', self numArgs printString, ' argument(s), not ', count printString
! !

!BlockClosure methodsFor: 'controlling'!
whileTrue: aBlock
	[self value] whileTrue: [aBlock value].
	^nil
!
whileFalse: aBlock
	[self value] whileFalse: [aBlock value].
	^nil
!
whileTrue
	[self value] whileTrue.
	^nil
!
whileFalse
	[self value] whileFalse.
	^nil
!
repeat
	[true] whileTrue: [self value]
! !

!BlockClosure methodsFor: 'testing'!
isBlock
	^true
! !

!BlockClosure methodsFor: 'timing'!
timeToRun
	^Time millisecondsToRun: self
! !
