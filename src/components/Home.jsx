import { Link } from 'react-router-dom';
import './Home.css';

function Home() {
  return (
    <div className="home-container">
      <header className="home-header">
        <div className="header-content">
          <h1>Memory Library</h1>
          <p className="subtitle">tools for the mind</p>
        </div>
      </header>

      <main className="modules-grid">
        {/* Archive Module */}
        <Link to="/archive" className="module-card" data-module="archive">
          <div className="module-icon">
            <div className="archive-icon">
              <div className="bookshelf">
                <div className="book book1"></div>
                <div className="book book2"></div>
                <div className="book book3"></div>
                <div className="book book4"></div>
              </div>
            </div>
          </div>
          <h3>Archive</h3>
          <p>Browse all memories in a searchable, filterable library. Perfect for finding specific moments or themes.</p>
          <div className="module-features">
            <span className="feature">Search</span>
            <span className="feature">Filter</span>
            <span className="feature">Browse</span>
          </div>
          <button className="launch-btn" onClick={(e) => e.preventDefault()}>Launch Archive</button>
        </Link>

        {/* Conspiracy Board Module */}
        <Link to="/conspiracy-board" className="module-card" data-module="conspiracy">
          <div className="module-icon">
            <div className="conspiracy-icon">
              <div className="pushpin">
                <div className="pin-head"></div>
                <div className="pin-body"></div>
                <div className="pin-shadow"></div>
              </div>
            </div>
          </div>
          <h3>Conspiracy Board</h3>
          <p>Connect the dots with notes and red strings on a corkboard. Build webs of connections, theories, and revelations.</p>
          <div className="module-features">
            <span className="feature">Pin & Connect</span>
            <span className="feature">Red Strings</span>
            <span className="feature">Visual Links</span>
          </div>
          <button className="launch-btn" onClick={(e) => e.preventDefault()}>Launch Conspiracy Board</button>
        </Link>

        {/* Chronology Module */}
        <Link to="/chronology" className="module-card" data-module="timeline">
          <div className="module-icon">
            <div className="timeline-icon">
              <div className="hourglass">
                <div className="hourglass-top"></div>
                <div className="hourglass-middle"></div>
                <div className="hourglass-bottom"></div>
              </div>
            </div>
          </div>
          <h3>Chronology</h3>
          <p>Organize memories chronologically on an interactive timeline. Drag and drop events, explore connections over time.</p>
          <div className="module-features">
            <span className="feature">Chronological</span>
            <span className="feature">Drag & Drop</span>
            <span className="feature">Interactive</span>
          </div>
          <button className="launch-btn" onClick={(e) => e.preventDefault()}>Launch Chronology</button>
        </Link>

        {/* Libraries Module */}
        <Link to="/libraries" className="module-card" data-module="constellation">
          <div className="module-icon">
            <div className="constellation-icon">
              <div className="star-pattern">
                <div className="star" style={{ top: '25%', left: '25%' }}></div>
                <div className="star" style={{ top: '45%', left: '70%' }}></div>
                <div className="star" style={{ top: '70%', left: '40%' }}></div>
                <div className="star" style={{ top: '20%', left: '75%' }}></div>
              </div>
              <div className="constellation-lines">
                <div className="star-line line1"></div>
                <div className="star-line line2"></div>
                <div className="star-line line3"></div>
              </div>
            </div>
          </div>
          <h3>Libraries</h3>
          <p>Discover patterns and clusters in your connected memories. Explore constellations of related thoughts and ideas.</p>
          <div className="module-features">
            <span className="feature">Pattern Discovery</span>
            <span className="feature">Memory Clusters</span>
            <span className="feature">Collections</span>
          </div>
          <button className="launch-btn" onClick={(e) => e.preventDefault()}>Launch Libraries</button>
        </Link>

        {/* Lessons Module */}
        <div className="module-card coming-soon" data-module="lessons">
          <div className="module-icon">
            <div className="lessons-icon">
              <div className="book-open">
                <div className="page-left"></div>
                <div className="page-right">
                  <div className="text-line"></div>
                  <div className="text-line"></div>
                  <div className="text-line"></div>
                </div>
                <div className="book-spine"></div>
              </div>
            </div>
          </div>
          <h3>Lessons</h3>
          <p>Guided exercises and lessons to help you explore memory patterns, understand recall, and develop new perspectives.</p>
          <div className="module-features">
            <span className="feature">Guided Learning</span>
            <span className="feature">Memory Exercises</span>
            <span className="feature">Pattern Discovery</span>
          </div>
          <button className="launch-btn coming-soon" disabled>Coming Soon</button>
        </div>
      </main>
    </div>
  );
}

export default Home;
