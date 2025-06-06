const circleBg = document.getElementById('circleBg');
const link = document.getElementById('circleLink');

link.addEventListener('mouseenter', () => {
    circleBg.classList.add('enlarged');
});

link.addEventListener('mouseleave', () => {
    circleBg.classList.remove('enlarged');
});
